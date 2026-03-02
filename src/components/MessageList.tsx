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
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth scroll-mask">
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
        "flex flex-col max-w-[90%] sm:max-w-[80%] group",
        isUser ? "ml-auto items-end" : "mr-auto items-start"
      )}
    >
      <div className={cn(
        "px-5 py-4 rounded-3xl shadow-sm relative overflow-hidden",
        isUser 
          ? "bg-gradient-to-br from-orange-500 to-[#ff4e00] text-white rounded-tr-sm" 
          : "glass-panel text-[#E0E0E0] rounded-tl-sm"
      )}>
        {message.image && (
          <img 
            src={message.image} 
            alt="Uploaded" 
            className="max-w-full rounded-xl mb-3 border border-white/10 shadow-lg" 
            referrerPolicy="no-referrer"
          />
        )}
        <div className={cn(
          "whitespace-pre-wrap",
          !isUser && "serif-content"
        )}>
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-orange-400 animate-pulse align-middle" />
          )}
          {!message.content && message.isStreaming && (
            <div className="flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" />
            </div>
          )}
        </div>
      </div>
      <div className={cn(
        "mt-2 flex items-center gap-3 px-2",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <span className="micro-label">
          {isUser ? 'You' : assistantName}
        </span>
        <span className="text-[10px] text-white/20 font-mono">
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
