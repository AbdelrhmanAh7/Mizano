'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useSendChatMessage, useChatHistory, useClearChatHistory } from '@/lib/hooks/use-ai';
import { getIntentColor, formatConfidence } from '@/lib/hooks/use-ai-chatbot';
import { ChatMessage } from './chat-message';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: historyData } = useChatHistory(50);
  const sendMessage = useSendChatMessage();
  const clearHistory = useClearChatHistory();

  // History is wrapped by TransformInterceptor as { data: ChatMessage[] }
  const messages = Array.isArray(historyData?.data) ? historyData.data : [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMessage.isPending]);

  const handleSend = () => {
    if (!message.trim() || sendMessage.isPending) return;

    const userMessage = message.trim();
    setMessage('');

    sendMessage.mutate(userMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear chat history?')) {
      sendMessage.reset();
      await clearHistory.mutateAsync();
    }
  };

  // Extract suggestions from the latest response
  const lastResponse = sendMessage.data?.data || sendMessage.data;
  const suggestions: string[] = lastResponse?.suggestions || [];

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
        aria-label="Open AI assistant"
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-background border rounded-lg shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-purple-600" />
          <h3 className="font-semibold">AI Assistant</h3>
          <Badge variant="outline" className="bg-green-50 text-green-700">
            Online
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearHistory}
            disabled={clearHistory.isPending}
            aria-label="Clear chat history"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && !sendMessage.isPending && (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Ask me anything about your business data!</p>
              <div className="mt-4 space-y-1 text-xs">
                <p>Try: &quot;What are my top expenses this month?&quot;</p>
                <p>Try: &quot;Show me overdue invoices&quot;</p>
                <p>Try: &quot;How is my cash flow?&quot;</p>
              </div>
            </div>
          )}

          {messages.map((msg: any, i: number) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {sendMessage.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}

          {/* Latest response metadata (intent + confidence) */}
          {!sendMessage.isPending && lastResponse?.intent && (
            <div className="flex items-center gap-2 ml-8">
              <Badge variant="outline" className={`text-xs ${getIntentColor(lastResponse.intent)}`}>
                {lastResponse.intent}
              </Badge>
              {lastResponse.confidence != null && (
                <Badge variant="outline" className="text-xs">
                  {formatConfidence(lastResponse.confidence)}
                </Badge>
              )}
            </div>
          )}

          {/* Suggestions from the latest response */}
          {!sendMessage.isPending && suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((suggestion: string, i: number) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setMessage(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your business..."
            disabled={sendMessage.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            size="icon"
            aria-label="Send message"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
