import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Trash2, 
  Loader2,
  Menu,
  X,
  MessageSquare,
  Zap,
  Plus,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { voiceService, VOICE_OPTIONS, type VoiceId } from './services/voiceService';
import type { VoiceMode } from './services/automationTools';
import { useMessages } from './hooks/useMessages';
import { MessageList } from './components/MessageList';
import { type ChatSession } from './types';
import { cn } from './lib/utils';
import { createId } from './lib/id';
import StartupScreen from './components/StartupScreen';

// Wire-free test mode

function describeUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const msg = typeof err.message === 'string' ? err.message : '';
    return msg.trim() ? msg : err.name;
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
    if (typeof anyErr.error === 'string' && anyErr.error.trim()) return anyErr.error;
    try {
      const s = JSON.stringify(err);
      if (typeof s === 'string' && s.trim()) return s;
    } catch {
      // ignore
    }
    return Object.prototype.toString.call(err);
  }
  const s = String(err);
  return s.trim() ? s : 'Unknown error';
}

export default function App() {
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('amo_chats');
    let parsed: ChatSession[] = [];
    if (saved) {
      try { parsed = JSON.parse(saved); } catch { parsed = []; }
    }
    if (parsed.length === 0) {
      parsed = [{ id: createId('chat-'), title: 'New Chat', messages: [], updatedAt: Date.now() }];
    }
    return parsed;
  });

  const [currentChatId, setCurrentChatId] = useState<string>(chats[0]?.id || Date.now().toString());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState('');
  const [modelError, setModelError] = useState<string | null>(null);
  const [diagnosticsText, setDiagnosticsText] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [toast, setToast] = useState<{message: string; type: 'info' | 'error' | 'success'} | null>(null);
  const [livePersona, setLivePersona] = useState<'Amo' | 'Riri'>('Amo');
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>('amo');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceReady, setIsVoiceReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('off');
  const [selectedAgent, setSelectedAgent] = useState<'Amo' | 'Riri' | null>(() => {
    const saved = localStorage.getItem('amo_selected_agent');
    return (saved as 'Amo' | 'Riri') || null;
  });
  const [ready, setReady] = useState(false);
  
  if (!ready) {
    return <StartupScreen onReady={() => setReady(true)} />;
  }
  
  const [isCloudMode, setIsCloudMode] = useState(() => {
    const saved = localStorage.getItem('amo_cloud_enabled');
    return saved === 'true';
  });
  const [cloudProvider, setCloudProvider] = useState(() => localStorage.getItem('amo_cloud_provider') || 'groq');
  const [cloudEndpoint, setCloudEndpoint] = useState(() => localStorage.getItem('amo_cloud_endpoint') || 'https://api.groq.com');
  const [cloudApiKey, setCloudApiKey] = useState(() => localStorage.getItem('amo_cloud_api_key') || '');
  const [cloudModel, setCloudModel] = useState(() => localStorage.getItem('amo_cloud_model') || 'llama-3.1-8b-instant');

  const cloudPresets = {
    groq: {
      endpoint: 'https://api.groq.com',
      model: 'llama-3.1-8b-instant',
      placeholder: 'Your Groq API key',
    },
    openai: {
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      placeholder: 'sk-...',
    },
    huggingface: {
      endpoint: 'https://api-inference.huggingface.co',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      placeholder: 'hf_...',
    },
    custom: {
      endpoint: '',
      model: 'llama3',
      placeholder: 'http://localhost:11434',
    },
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const playUiClick = (): void => {
    // Sound disabled in wire-free test
    return;
  };

  const handleAgentSelect = (agent: 'Amo' | 'Riri') => {
    localStorage.setItem('amo_selected_agent', agent);
    setSelectedAgent(agent);
    setLivePersona(agent);
    setSelectedVoice(agent.toLowerCase() as VoiceId);
    voiceService.setVoice(agent.toLowerCase() as VoiceId);
  };

  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => { setIsOnline(false); showToast('You are offline', 'info'); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const initVoice = async () => {
      try {
        // Do not eagerly init Kokoro. System TTS can work without model downloads.
        // Kokoro will initialize on first use.
        setIsVoiceReady(true);
      } catch (err) {
        console.warn('[Voice] Init failed:', err);
      }
    };
    if (selectedAgent && !isVoiceReady) initVoice();
  }, [selectedAgent, isVoiceReady]);

  // Diagnostics disabled for wire-free test
  /*
  useEffect(() => {
    (async () => {
      try {
        const r = await runDiagnostics();
        setDiagnosticsText(
          `webgpu:${r.webgpu.ok ? 'ok' : 'no'} webllm:${r.webllm.ok ? 'ok' : 'missing'} opfs:${r.opfs.ok ? 'ok' : 'no'} model:${r.webllm.modelId}`
        );
        console.groupCollapsed('[Diagnostics]');
        console.table({
          webgpu: r.webgpu.detail,
          webllm: `${r.webllm.ok ? 'ok' : 'bad'}: ${r.webllm.modelId}`,
          ttsSystem: r.ttsSystem.detail,
          opfs: r.opfs.detail,
        });
        console.groupEnd();
      } catch (e) {
        console.warn('[Diagnostics] Failed to run diagnostics', e);
      }
    })();
  }, []);
  */

  const loadModel = async () => {
    // WIRE-FREE TEST MODE: No AI services loaded
    // This is a barebones test to verify UI works without any AI
    setIsModelLoading(true);
    setModelProgress(0);
    setModelStatus('Testing...');
    setModelError(null);
    
    // Simulate loading delay
    await new Promise(r => setTimeout(r, 500));
    setModelProgress(100);
    setModelStatus('Ready (test mode)');
    setIsModelLoaded(true);
    showToast('Test mode: UI ready', 'info');
    setIsModelLoading(false);
  };

  const currentChat = chats.find((c: ChatSession) => c.id === currentChatId) || chats[0];
  const { messages, setMessages, addMessage, appendToMessage, finalizeMessage } = useMessages(currentChat?.messages || []);

  useEffect(() => {
    if (currentChat) setMessages(currentChat.messages);
  }, [currentChatId]);

  useEffect(() => {
    setChats((prev: ChatSession[]) => prev.map((chat: ChatSession) => {
      if (chat.id === currentChatId) {
        let newTitle = chat.title;
        if (chat.title === 'New Chat' && messages.length > 0) {
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg && firstUserMsg.content) {
            newTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
          }
        }
        return { ...chat, messages, title: newTitle, updatedAt: Date.now() };
      }
      return chat;
    }));
  }, [messages, currentChatId]);

  const createNewChat = () => {
    const newChat: ChatSession = { id: createId('chat-'), title: 'New Chat', messages: [], updatedAt: Date.now() };
    setChats((prev: ChatSession[]) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setIsSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats((prev: ChatSession[]) => {
      const updated = prev.filter((c: ChatSession) => c.id !== id);
      if (updated.length === 0) {
        return [{ id: `chat-${Date.now()}`, title: 'New Chat', messages: [], updatedAt: Date.now() }];
      }
      return updated;
    });
    if (id === currentChatId) {
      setCurrentChatId(chats[0]?.id || '');
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // Stub for wire-free test - just echoes user message
  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || isLoading) return;
    if (!isModelLoaded) {
      showToast('Download Amo first', 'info');
      return;
    }

    setInput('');
    setIsLoading(true);

    addMessage('user', textToSend);
    const assistantMsgId = addMessage('assistant', '');

    try {
      // Wire-free test: echo response
      const response = `[Test] Received: "${textToSend}"`;
      appendToMessage(assistantMsgId, response);
    } catch (err: any) {
      appendToMessage(assistantMsgId, `Error: ${err.message}`);
    } finally {
      finalizeMessage(assistantMsgId);
      setIsLoading(false);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
    } else {
      // Barge-in: stop speaking/generation when user starts talking.
      if (isSpeaking) {
        voiceService.stopSpeaking();
        setIsSpeaking(false);
      }
      if (isLoading) {
        // No AI to interrupt in test mode
        setIsLoading(false);
      }

      // Unlock audio output on a user gesture (enables later auto-TTS).
      try {
        await voiceService.unlockAudio();
      } catch {
        // ignore
      }

      setIsListening(true);
      try {
        await voiceService.startListening(
          (finalText) => {
            setIsListening(false);
            if (voiceMode === 'handsfree') {
              void handleSend(finalText);
            } else {
              setInput((prev) => (prev ? prev + ' ' : '') + finalText);
            }
          },
          (partialText) => {
            if (voiceMode === 'handsfree') {
              setInput(partialText);
            }
          }
        );
      } catch (err: any) {
        setIsListening(false);
        showToast(err?.message ?? 'Voice input failed', 'error');
      }
    }
  };

  const toggleSpeaking = async () => {
    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    } else if (messages.length > 0) {
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.content);
      if (lastAssistantMsg) {
        try {
          await voiceService.unlockAudio();
        } catch (err: any) {
          showToast(err?.message ?? 'Audio output is blocked', 'error');
          // Continue: system TTS may still work even if WebAudio is locked.
        }
        setIsSpeaking(true);
        try {
          await voiceService.speak(lastAssistantMsg.content);
        } catch (err: any) {
          showToast(err?.message ?? 'TTS failed', 'error');
        } finally {
          setIsSpeaking(false);
        }
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!selectedAgent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505]">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[radial-gradient(#151515_1px,transparent_1px)] bg-[size:20px_20px]" />
        </div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-[#a855f7] to-[#d946ef] bg-clip-text text-transparent">My Bro</h1>
          <p className="text-[#a3a3a3] text-lg tracking-widest uppercase mb-16">Select Your Agent</p>
          
          <div className="flex gap-12 mb-16">
            <motion.button onClick={() => handleAgentSelect('Amo')} whileHover={{ scale: 1.08, y: -10 }} whileTap={{ scale: 0.98 }} className="w-[250px] h-[350px] rounded-2xl bg-gradient-to-b from-[#121212] to-[#0a0a0a] border border-[#1f1f1f] flex flex-col items-center justify-center cursor-pointer shadow-[0_15px_35px_-5px_rgba(168,85,247,0.5),0_0_20px_rgba(217,70,239,0.3)]">
              <div className="w-24 h-24 rounded-full mb-6 bg-gradient-to-br from-[#4c1d95] to-[#7c3aed] flex items-center justify-center text-4xl font-bold text-white shadow-[inset_0_0_10px_#000]">A</div>
              <p className="text-2xl font-bold text-white">Amo</p>
              <p className="text-[#888] text-sm mt-2">Digital Bro</p>
            </motion.button>
            
            <motion.button onClick={() => handleAgentSelect('Riri')} whileHover={{ scale: 1.08, y: -10 }} whileTap={{ scale: 0.98 }} className="w-[250px] h-[350px] rounded-2xl bg-gradient-to-b from-[#121212] to-[#0a0a0a] border border-[#1f1f1f] flex flex-col items-center justify-center cursor-pointer shadow-[0_15px_35px_-5px_rgba(168,85,247,0.5),0_0_20px_rgba(217,70,239,0.3)]">
              <div className="w-24 h-24 rounded-full mb-6 bg-gradient-to-br from-[#86198f] to-[#d946ef] flex items-center justify-center text-4xl font-bold text-white shadow-[inset_0_0_10px_#000]">R</div>
              <p className="text-2xl font-bold text-white">Riri</p>
              <p className="text-[#888] text-sm mt-2">Digital Bro</p>
            </motion.button>
          </div>
          
          <div className="px-6 py-3 rounded-full border border-[#a855f7] text-[#d946ef] font-bold bg-[rgba(168,85,247,0.1)] inline-block">
            Currently In Development
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#080808] text-[#e8e0f0] font-sans selection:bg-purple-500/30 overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_20%,rgba(74,26,138,0.25),transparent_60%),radial-gradient(ellipse_50%_60%_at_80%_80%,rgba(123,53,232,0.18),transparent_60%),radial-gradient(ellipse_40%_40%_at_60%_10%,rgba(168,85,247,0.08),transparent_50%)]" />
      </div>

      <header className="h-16 border-b border-[rgba(120,50,220,0.18)] flex items-center justify-between px-6 bg-[rgba(8,8,8,0.7)] backdrop-blur-xl z-30 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#7a6a9a] hover:text-[#e8e0f0] hover:bg-[rgba(123,53,232,0.1)] rounded-lg transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7b35e8] to-[#e040fb] flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.5)]">
              <Zap className="text-white w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-lg bg-gradient-to-r from-[#a855f7] to-[#e040fb] bg-clip-text text-transparent">My Bro</h1>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full", isOnline ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400")}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={cn("w-2 h-2 rounded-full", isModelLoaded ? "bg-[#a855f7] shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "bg-[#7a6a9a]")} />
                <span className="text-[10px] text-[#7a6a9a]">{isModelLoaded ? livePersona : 'Loading...'}</span>
              </div>
            </div>
          </div>
        </div>
        
        {!isModelLoaded && !isModelLoading && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsCloudMode((v) => {
                  const next = !v;
                  localStorage.setItem('amo_cloud_enabled', String(next));
                  return next;
                });
              }}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-medium border transition-all",
                isCloudMode
                  ? "bg-[rgba(59,130,246,0.2)] border-[rgba(59,130,246,0.4)] text-blue-300"
                  : "bg-[rgba(255,255,255,0.03)] border-[rgba(120,50,220,0.18)] text-[#7a6a9a]"
              )}
              title={isCloudMode ? 'Cloud mode ON' : 'Cloud mode OFF'}
            >
              Cloud
            </button>
            <button onClick={loadModel} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7b35e8] to-[#e040fb] text-white text-sm font-medium hover:opacity-90 transition-opacity">
              {isCloudMode ? 'Connect' : 'Download Amo!'}
            </button>
          </div>
        )}
      </header>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        )}
      </AnimatePresence>

      <div className={cn("fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform transition-transform duration-300 ease-in-out flex flex-col border-r border-[rgba(120,50,220,0.18)] bg-[rgba(17,17,21,0.95)] backdrop-blur-xl", isSidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="p-6 flex items-center justify-between border-b border-[rgba(120,50,220,0.18)]">
          <h2 className="font-display font-bold text-[#e8e0f0]">Chats</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-[#7a6a9a] hover:text-[#e8e0f0] hover:bg-[rgba(123,53,232,0.1)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <button onClick={() => { createNewChat(); setIsSidebarOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#7b35e8] to-[#e040fb] text-white hover:opacity-90 rounded-xl transition-all font-medium shadow-lg shadow-purple-500/30">
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {chats.map(chat => (
            <div key={chat.id} onClick={() => { setCurrentChatId(chat.id); setIsSidebarOpen(false); }} className={cn("w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left transition-all cursor-pointer group border", currentChatId === chat.id ? "bg-[rgba(123,53,232,0.15)] text-[#e8e0f0] border-[rgba(123,53,232,0.3)]" : "text-[#7a6a9a] hover:bg-[rgba(123,53,232,0.08)] hover:text-[#e8e0f0] border-transparent")}>
              <div className="truncate pr-2 text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4 shrink-0" />
                {chat.title}
              </div>
              <button onClick={(e) => deleteChat(chat.id, e)} className="opacity-0 group-hover:opacity-100 p-1.5 text-[#7a6a9a] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {isModelLoading && (
          <div className="p-4 border-b border-[rgba(120,50,220,0.18)] bg-[rgba(17,17,21,0.8)]">
            <div className="max-w-md mx-auto space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[#7a6a9a]">{modelStatus}</span>
                <span className="text-[#a855f7] font-mono">{modelProgress}%</span>
              </div>
              <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-[#7b35e8] to-[#e040fb]" initial={{ width: 0 }} animate={{ width: `${modelProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
          {messages.length === 0 && !isModelLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 px-4">
              <div className="w-20 h-20 rounded-3xl bg-[rgba(255,255,255,0.03)] border border-[rgba(123,53,232,0.2)] flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-[#7a6a9a]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold bg-gradient-to-r from-[#a855f7] to-[#e040fb] bg-clip-text text-transparent mb-2">My Bro {livePersona}</h2>
                <p className="text-sm text-[#7a6a9a]">{isModelLoaded ? 'Start chatting...' : isCloudMode ? 'Configure cloud connection' : 'Load the model to start chatting'}</p>
                {modelError && (
                  <p className="mt-3 text-xs text-red-300 break-words">{modelError}</p>
                )}
                {diagnosticsText && (
                  <p className="mt-2 text-[10px] text-white/30 break-words">{diagnosticsText}</p>
                )}
              </div>
              {!isModelLoaded && (
                <div className="space-y-4 w-full max-w-xs">
                  {isCloudMode && (
                    <div className="space-y-3 text-left">
                      <div>
                        <label className="block text-[10px] text-[#7a6a9a] mb-1">Provider</label>
                        <select
                          value={cloudProvider}
                          onChange={(e) => {
                            const provider = e.target.value;
                            setCloudProvider(provider);
                            localStorage.setItem('amo_cloud_provider', provider);
                            const preset = cloudPresets[provider as keyof typeof cloudPresets];
                            if (preset) {
                              setCloudEndpoint(preset.endpoint);
                              setCloudModel(preset.model);
                              localStorage.setItem('amo_cloud_endpoint', preset.endpoint);
                              localStorage.setItem('amo_cloud_model', preset.model);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(123,53,232,0.2)] text-xs text-[#e8e0f0] focus:outline-none focus:border-[#7b35e8]"
                        >
                          <option value="groq" className="bg-[#111115]">Groq (Free, fast)</option>
                          <option value="openai" className="bg-[#111115]">OpenAI</option>
                          <option value="huggingface" className="bg-[#111115]">HuggingFace</option>
                          <option value="custom" className="bg-[#111115]">Custom Server</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#7a6a9a] mb-1">
                          {cloudProvider === 'custom' ? 'Server URL' : 'Endpoint'}
                        </label>
                        <input
                          type="text"
                          value={cloudEndpoint}
                          onChange={(e) => {
                            setCloudEndpoint(e.target.value);
                            localStorage.setItem('amo_cloud_endpoint', e.target.value);
                          }}
                          placeholder={cloudPresets[cloudProvider as keyof typeof cloudPresets]?.placeholder || 'URL'}
                          className="w-full px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(123,53,232,0.2)] text-xs text-[#e8e0f0] placeholder:text-[#7a6a9a] focus:outline-none focus:border-[#7b35e8]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#7a6a9a] mb-1">Model</label>
                        <input
                          type="text"
                          value={cloudModel}
                          onChange={(e) => {
                            setCloudModel(e.target.value);
                            localStorage.setItem('amo_cloud_model', e.target.value);
                          }}
                          placeholder="Model name"
                          className="w-full px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(123,53,232,0.2)] text-xs text-[#e8e0f0] placeholder:text-[#7a6a9a] focus:outline-none focus:border-[#7b35e8]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#7a6a9a] mb-1">API Key {cloudProvider === 'groq' && '(get free at groq.com)'}</label>
                        <input
                          type="password"
                          value={cloudApiKey}
                          onChange={(e) => {
                            setCloudApiKey(e.target.value);
                            localStorage.setItem('amo_cloud_api_key', e.target.value);
                          }}
                          placeholder={cloudPresets[cloudProvider as keyof typeof cloudPresets]?.placeholder || 'API key'}
                          className="w-full px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(123,53,232,0.2)] text-xs text-[#e8e0f0] placeholder:text-[#7a6a9a] focus:outline-none focus:border-[#7b35e8]"
                        />
                      </div>
                    </div>
                  )}
                  <button onClick={loadModel} className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#7b35e8] to-[#e040fb] text-white font-medium hover:opacity-90 transition-opacity w-full">
                    {isCloudMode ? 'Connect' : 'Download Amo!'}
                  </button>
                </div>
              )}
            </div>
          )}
          
          <MessageList messages={messages} onCopy={(text) => navigator.clipboard.writeText(text)} />
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 bg-[rgba(17,17,21,0.8)] backdrop-blur-xl border-t border-[rgba(120,50,220,0.18)]">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end">
              <button onClick={toggleListening} disabled={!isVoiceReady} className="w-12 h-12 shrink-0 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(123,53,232,0.25)] flex items-center justify-center transition-all disabled:opacity-50">
                {isListening ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-[#7a6a9a] hover:text-[#a855f7]" />}
              </button>

              <button
                onClick={() => setVoiceMode((m) => (m === 'off' ? 'handsfree' : 'off'))}
                className={cn(
                  "w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center transition-all",
                  voiceMode === 'handsfree'
                    ? "bg-[rgba(123,53,232,0.18)] border-[rgba(123,53,232,0.35)] text-[#e8e0f0]"
                    : "bg-[rgba(255,255,255,0.03)] border-[rgba(123,53,232,0.25)] text-[#7a6a9a]"
                )}
                title={voiceMode === 'handsfree' ? 'Hands-free on' : 'Hands-free off'}
              >
                <Sparkles className="w-5 h-5" />
              </button>
              
              <button onClick={toggleSpeaking} disabled={!isVoiceReady || messages.filter(m => m.role === 'assistant').length === 0} className="w-12 h-12 shrink-0 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(123,53,232,0.25)] flex items-center justify-center transition-all disabled:opacity-50">
                {isSpeaking ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-[#7a6a9a] hover:text-[#a855f7]" />}
              </button>

              <div className="relative flex-1">
                <textarea ref={inputRef} value={input} onChange={handleInput} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={isModelLoaded ? "Type something..." : "Load model first"} disabled={!isModelLoaded && !isModelLoading} rows={1} className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(123,53,232,0.25)] rounded-2xl px-5 py-3.5 pr-14 text-sm text-[#e8e0f0] placeholder:text-[#7a6a9a] focus:outline-none focus:border-[#7b35e8] focus:shadow-[0_0_20px_rgba(123,53,232,0.2)] transition-all resize-none disabled:opacity-50" style={{ minHeight: '52px', maxHeight: '120px' }} />
                <button onClick={() => handleSend()} disabled={!input.trim() || isLoading || (!isModelLoaded && !isModelLoading)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gradient-to-r from-[#7b35e8] to-[#e040fb] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/30">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={cn("fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium shadow-xl z-50", toast.type === 'error' ? "bg-red-500/90 text-white" : toast.type === 'success' ? "bg-green-500/90 text-white" : "bg-[rgba(123,53,232,0.9)] text-white")}>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
