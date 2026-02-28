// useMessages.ts
// Fixes the duplicate React key bug by ensuring every message
// gets a stable, unique ID at creation time — never derived from
// role, content, or array index.

import React, { useState, useCallback, useRef } from 'react';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;          // stable, unique — safe to use as React key
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  image?: string;
}

function generateId(): string {
  // Use crypto.randomUUID() where available (all modern browsers)
  // Fall back to timestamp + random for older environments
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface UseMessagesReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (role: MessageRole, content: string, image?: string) => string;
  updateMessage: (id: string, content: string, isStreaming?: boolean) => void;
  finalizeMessage: (id: string) => void;
  clearMessages: () => void;
  addStreamingMessage: (role: MessageRole) => string;
  appendToMessage: (id: string, chunk: string) => void;
}

export function useMessages(initialMessages: Omit<Message, 'id' | 'timestamp'>[] = []): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>(() =>
    initialMessages.map(m => ({
      ...m,
      id: generateId(),       // ← each initial message gets a unique ID
      timestamp: Date.now(),
    }))
  );

  // Track streaming message IDs to avoid accidental duplicates
  const streamingIds = useRef<Set<string>>(new Set());

  // Add a complete message at once
  const addMessage = useCallback((role: MessageRole, content: string, image?: string): string => {
    const id = generateId();
    setMessages(prev => [...prev, {
      id,
      role,
      content,
      timestamp: Date.now(),
      isStreaming: false,
      image,
    }]);
    return id;
  }, []);

  // Add an empty message that will be filled via appendToMessage (streaming)
  const addStreamingMessage = useCallback((role: MessageRole): string => {
    const id = generateId();
    streamingIds.current.add(id);
    setMessages(prev => [...prev, {
      id,
      role,
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }]);
    return id;
  }, []);

  // Append a chunk to a streaming message
  const appendToMessage = useCallback((id: string, chunk: string): void => {
    setMessages(prev =>
      prev.map(m => m.id === id
        ? { ...m, content: m.content + chunk }
        : m
      )
    );
  }, []);

  // Replace full content of an existing message
  const updateMessage = useCallback((id: string, content: string, isStreaming = false): void => {
    setMessages(prev =>
      prev.map(m => m.id === id
        ? { ...m, content, isStreaming }
        : m
      )
    );
  }, []);

  // Mark a streaming message as complete
  const finalizeMessage = useCallback((id: string): void => {
    streamingIds.current.delete(id);
    setMessages(prev =>
      prev.map(m => m.id === id
        ? { ...m, isStreaming: false }
        : m
      )
    );
  }, []);

  const clearMessages = useCallback((): void => {
    streamingIds.current.clear();
    setMessages([]);
  }, []);

  return {
    messages,
    setMessages,
    addMessage,
    updateMessage,
    finalizeMessage,
    clearMessages,
    addStreamingMessage,
    appendToMessage,
  };
}
