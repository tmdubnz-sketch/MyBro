import React from 'react';
import { Message } from '../hooks/useMessages';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Copy, RefreshCw } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  assistantName?: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (id: string) => void;
}

export function MessageList({ messages, assistantName = 'Assistant', onCopy, onRegenerate }: MessageListProps) {
  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <MessageBubble 
          key={message.id} 
          message={message} 
          assistantName={assistantName}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
        />
      ))}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  assistantName: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (id: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  assistantName,
  onCopy,
  onRegenerate
}) => {
  const isUser = message.role === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[75%] group",
        isUser ? "ml-auto items-end" : "mr-auto items-start"
      )}
    >
<div className={cn(
        "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
        isUser 
          ? "bg-gradient-to-r from-[#7b35e8] to-[#e040fb] text-white rounded-tr-none" 
          : "bg-[#111115] text-[#e8e0f0] border border-[rgba(123,53,232,0.25)] rounded-tl-none"
      )}>
        {message.image && (
          <img 
            src={message.image} 
            alt="Uploaded" 
            className="max-w-full rounded-lg mb-2 border border-white/10" 
            referrerPolicy="no-referrer"
          />
        )}
        <div className="whitespace-pre-wrap">
          {message.content}
{message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-[#a855f7] animate-pulse align-middle" />
          )}
          {!message.content && message.isStreaming && (
            <div className="flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-[#a855f7] rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-[#a855f7] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-[#a855f7] rounded-full animate-bounce" />
            </div>
          )}
        </div>
      </div>
      <div className={cn(
        "mt-1.5 flex items-center gap-3 px-1",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
          {isUser ? 'You' : assistantName}
        </span>
        <span className="text-[10px] text-white/20">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {!message.isStreaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onCopy && (
              <button 
                onClick={() => onCopy(message.content)}
                className="p-1 text-white/20 hover:text-white/60 transition-colors"
                title="Copy message"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
            {!isUser && onRegenerate && (
              <button 
                onClick={() => onRegenerate(message.id)}
                className="p-1 text-white/20 hover:text-white/60 transition-colors"
                title="Regenerate response"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
