import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ============ Types ============

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatResponse {
  response: string;
  intent: string;
  confidence: number;
  data?: unknown;
  suggestions?: string[];
  timestamp: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  count: number;
}

export interface TrainChatbotResult {
  success: boolean;
  samplesUsed: number;
  message: string;
}

// ============ API Functions ============

const chatbotApi = {
  sendMessage: async (message: string) => {
    const response = await api.post('/ai/chatbot/message', { message });
    return response.data;
  },
  getHistory: async (limit?: number) => {
    const response = await api.get('/ai/chatbot/history', {
      params: { limit },
    });
    const raw = response.data;
    // Normalize: backend returns flat array, widget expects { data: [...] }
    return Array.isArray(raw) ? { data: raw } : raw;
  },
  trainChatbot: async () => {
    const response = await api.post('/ai/chatbot/train');
    return response.data;
  },
  clearHistory: async () => {
    const response = await api.delete('/ai/chatbot/history');
    return response.data;
  },
};

// ============ Hooks ============

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatbotApi.sendMessage,
    onMutate: async (userMessage) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['ai-chatbot-history'] });

      // Snapshot current cache for rollback
      const previous = queryClient.getQueriesData({ queryKey: ['ai-chatbot-history'] });

      // Optimistically add the user's message to the history cache
      queryClient.setQueriesData(
        { queryKey: ['ai-chatbot-history'] },
        (old: { data?: ChatMessage[] } | undefined) => {
          const existing = Array.isArray(old?.data) ? old.data : [];
          return {
            ...old,
            data: [
              ...existing,
              { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
            ],
          };
        },
      );

      return { previous };
    },
    onSuccess: (responseData) => {
      const chatResponse = responseData?.data || responseData;

      // Optimistically add the assistant's response to the history cache
      queryClient.setQueriesData(
        { queryKey: ['ai-chatbot-history'] },
        (old: { data?: ChatMessage[] } | undefined) => {
          const existing = Array.isArray(old?.data) ? old.data : [];
          return {
            ...old,
            data: [
              ...existing,
              {
                role: 'assistant',
                content: chatResponse.response,
                intent: chatResponse.intent,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        },
      );

      // Sync with server truth
      queryClient.invalidateQueries({ queryKey: ['ai-chatbot-history'] });
    },
    onError: (_err, _msg, context) => {
      // Rollback on error
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
  });
}

export function useChatHistory(limit?: number) {
  return useQuery({
    queryKey: ['ai-chatbot-history', limit],
    queryFn: () => chatbotApi.getHistory(limit),
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch when user tabs back
    refetchOnMount: false, // Don't refetch on component remount
  });
}

export function useTrainChatbot() {
  return useMutation({
    mutationFn: chatbotApi.trainChatbot,
  });
}

/**
 * Streaming chatbot hook — sends a message and progressively builds the response
 * as tokens arrive via SSE. Falls back to useSendChatMessage if SSE fails.
 */
export function useSendChatMessageStream() {
  const queryClient = useQueryClient();
  const [streamingText, setStreamingText] = useState('');
  const [intent, setIntent] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      setStreamingText('');
      setIntent(null);
      setConfidence(0);
      setError(null);
      setIsStreaming(true);

      // Optimistically add user message to history
      queryClient.setQueriesData(
        { queryKey: ['ai-chatbot-history'] },
        (old: { data?: ChatMessage[] } | undefined) => {
          const existing = Array.isArray(old?.data) ? old.data : [];
          return {
            ...old,
            data: [
              ...existing,
              { role: 'user', content: message, timestamp: new Date().toISOString() },
            ],
          };
        },
      );

      try {
        // POST to stream endpoint — the response body is an SSE stream
        const baseUrl = api.defaults.baseURL || '';
        const response = await fetch(`${baseUrl}/ai/chatbot/message/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...((api.defaults.headers?.common as Record<string, string>) || {}),
          },
          body: JSON.stringify({ message }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        const processLine = (line: string) => {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (!data) return;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                accumulated += parsed.token;
                setStreamingText(accumulated);
              }
              if (parsed.intent) {
                setIntent(parsed.intent);
                setConfidence(parsed.confidence || 0);
              }
              if (parsed.error) {
                setError(parsed.error);
              }
            } catch {
              // ignore
            }
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line.trim());
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          processLine(buffer.trim());
        }

        // Add assistant response to history
        if (accumulated) {
          queryClient.setQueriesData(
            { queryKey: ['ai-chatbot-history'] },
            (old: { data?: ChatMessage[] } | undefined) => {
              const existing = Array.isArray(old?.data) ? old.data : [];
              return {
                ...old,
                data: [
                  ...existing,
                  {
                    role: 'assistant',
                    content: accumulated,
                    timestamp: new Date().toISOString(),
                  },
                ],
              };
            },
          );
        }

        queryClient.invalidateQueries({ queryKey: ['ai-chatbot-history'] });
      } catch (err) {
        // Fall back to non-streaming
        try {
          const response = await chatbotApi.sendMessage(message);
          const chatResponse = response?.data || response;
          setStreamingText(chatResponse.response || '');
          setIntent(chatResponse.intent);
          setConfidence(chatResponse.confidence || 0);

          queryClient.setQueriesData(
            { queryKey: ['ai-chatbot-history'] },
            (old: { data?: ChatMessage[] } | undefined) => {
              const existing = Array.isArray(old?.data) ? old.data : [];
              return {
                ...old,
                data: [
                  ...existing,
                  {
                    role: 'assistant',
                    content: chatResponse.response,
                    timestamp: new Date().toISOString(),
                  },
                ],
              };
            },
          );
          queryClient.invalidateQueries({ queryKey: ['ai-chatbot-history'] });
        } catch (fallbackErr) {
          setError(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to send message');
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [queryClient],
  );

  return {
    sendMessage,
    streamingText,
    intent,
    confidence,
    isStreaming,
    error,
  };
}

export function useClearChatHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatbotApi.clearHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-chatbot-history'] });
    },
  });
}

// ============ Helper Functions ============

export function getIntentColor(intent: string): string {
  const colors: Record<string, string> = {
    QUERY: 'bg-blue-100 text-blue-800',
    REPORT: 'bg-purple-100 text-purple-800',
    ANALYSIS: 'bg-green-100 text-green-800',
    RECOMMENDATION: 'bg-yellow-100 text-yellow-800',
    HELP: 'bg-gray-100 text-gray-800',
  };
  return colors[intent] || colors.HELP;
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
