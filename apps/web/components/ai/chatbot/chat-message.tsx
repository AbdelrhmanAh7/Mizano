'use client';

import { User, MessageSquare } from 'lucide-react';
import { formatTimestamp } from '@/lib/hooks/use-ai-chatbot';

interface ChatMessageProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-blue-100' : 'bg-purple-100'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-blue-600" />
        ) : (
          <MessageSquare className="h-4 w-4 text-purple-600" />
        )}
      </div>
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`rounded-lg p-3 max-w-[85%] ${
            isUser ? 'bg-blue-600 text-white' : 'bg-accent'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <p className={`text-xs mt-1 ${isUser ? 'text-blue-100' : 'text-muted-foreground'}`}>
            {formatTimestamp(message.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}
