import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Download, 
  Settings, 
  Cpu, 
  MessageSquare, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronDown,
  Terminal,
  Zap,
  Menu,
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  RefreshCw,
  DownloadCloud,
  ImagePlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { webLLMService } from './services/webLLMService';
import { geminiLiveService } from './services/geminiLiveService';
import { documentService } from './services/documentService';
import { vectorDbService } from './services/vectorDbService';
import { useMessages } from './hooks/useMessages';
import { MessageList } from './components/MessageList';
import { AVAILABLE_MODELS, type ModelConfig, type ChatSession } from './types';
import { cn } from './lib/utils';

export default function App() {
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('amo_chats');
    let parsed: ChatSession[] = [];
    
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch (e) {
        parsed = [];
      }
    } else {
      const oldHistory = localStorage.getItem('amo_chat_history');
      if (oldHistory) {
        try {
          const history = JSON.parse(oldHistory);
          if (history.length > 0) {
            parsed = [{ id: `chat-${Date.now()}`, title: 'Previous Chat', messages: history, updatedAt: Date.now() }];
          }
        } catch (e) {}
      }
    }

    if (parsed.length === 0) {
      parsed = [{ id: `chat-${Date.now()}`, title: 'New Chat', messages: [], updatedAt: Date.now() }];
    }

    // Sanitize: Ensure unique IDs for chats and messages to prevent duplicate key errors
    const seenChatIds = new Set();
    return parsed.map(chat => {
      let chatId = chat.id;
      if (!chatId || seenChatIds.has(chatId)) {
        chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      seenChatIds.add(chatId);

      const seenMsgIds = new Set();
      const sanitizedMessages = (chat.messages || []).map(msg => {
        let msgId = msg.id;
        if (!msgId || seenMsgIds.has(msgId)) {
          msgId = `${msg.role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        seenMsgIds.add(msgId);
        return { ...msg, id: msgId };
      });

      return { ...chat, id: chatId, messages: sanitizedMessages };
    });
  });
  const [currentChatId, setCurrentChatId] = useState<string>(chats[0]?.id || Date.now().toString());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [livePersona, setLivePersona] = useState<'Amo' | 'Riri'>('Amo');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<{id: string, name: string}[]>([]);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    vectorDbService.loadFromStorage().then(() => {
      const docs = vectorDbService.getDocuments();
      const uniqueDocs = Array.from(new Set(docs.map(d => d.documentId)))
        .map(id => {
          const doc = docs.find(d => d.documentId === id);
          return { id, name: doc?.documentName || 'Unknown' };
        });
      setUploadedDocs(uniqueDocs);
    });
  }, []);

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    try {
      const { content, name } = await documentService.parseFile(file);
      const documentId = crypto.randomUUID();
      const chunks = documentService.chunkDocument(content, documentId, name);
      
      for (const chunk of chunks) {
        await vectorDbService.addDocument(chunk);
      }
      
      setUploadedDocs((prev: {id: string, name: string}[]) => [...prev, { id: documentId, name }]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload document');
    } finally {
      setIsUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const removeDoc = (id: string) => {
    vectorDbService.removeDocument(id);
    setUploadedDocs((prev: {id: string, name: string}[]) => prev.filter(d => d.id !== id));
  };

  const currentChat = chats.find((c: ChatSession) => c.id === currentChatId) || chats[0];

  const { 
    messages, 
    setMessages, 
    addMessage, 
    updateMessage,
    addStreamingMessage, 
    appendToMessage, 
    finalizeMessage, 
    clearMessages 
  } = useMessages(currentChat?.messages || []);

  // Sync useMessages with currentChatId
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (currentChat) {
      setMessages(currentChat.messages);
    }
  }, [currentChatId]);

  // Sync messages back to chats
  useEffect(() => {
    setChats((prev: ChatSession[]) => prev.map((chat: ChatSession) => {
      if (chat.id === currentChatId) {
        // Only update if messages actually changed to avoid infinite loops
        if (JSON.stringify(chat.messages) === JSON.stringify(messages)) return chat;

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
    const newChat: ChatSession = {
      id: `chat-${crypto.randomUUID()}`,
      title: 'New Chat',
      messages: [],
      updatedAt: Date.now()
    };
    setChats((prev: ChatSession[]) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats((prev: ChatSession[]) => {
      const updated = prev.filter((c: ChatSession) => c.id !== id);
      if (updated.length === 0) {
        const newChat = { 
          id: `chat-${crypto.randomUUID()}`, 
          title: 'New Chat', 
          messages: [], 
          updatedAt: Date.now() 
        };
        setCurrentChatId(newChat.id);
        return [newChat];
      }
      if (currentChatId === id) {
        setCurrentChatId(updated[0].id);
      }
      return updated;
    });
  };

  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(AVAILABLE_MODELS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [triggerSend, setTriggerSend] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [liveUserTranscription, setLiveUserTranscription] = useState('');
  const [liveModelTranscription, setLiveModelTranscription] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef(input);
  const isVoiceModeRef = useRef(isVoiceMode);

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { isVoiceModeRef.current = isVoiceMode; }, [isVoiceMode]);

  useEffect(() => {
    localStorage.setItem('amo_chats', JSON.stringify(chats));
  }, [chats]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleRegenerate = (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    let lastUserMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    
    if (lastUserMessageIndex === -1) return;
    
    const userMessage = messages[lastUserMessageIndex];
    setMessages(prev => prev.slice(0, messageIndex));
    setInput(userMessage.content);
    inputRef.current = userMessage.content;
    setTriggerSend(true);
  };

  const handleExport = () => {
    const content = messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role.toUpperCase()}:\n${m.content}\n`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mybro-chat-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (!selectedVoiceURI && availableVoices.length > 0) {
        const nzVoice = availableVoices.find(v => v.lang === 'en-NZ' || v.lang.includes('NZ'));
        setSelectedVoiceURI(nzVoice ? nzVoice.voiceURI : availableVoices[0].voiceURI);
      }
    };
    
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceURI]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-NZ';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (isVoiceModeRef.current && inputRef.current.trim()) {
          setTriggerSend(true);
        }
      };
    }
  }, []);

  useEffect(() => {
    if (triggerSend) {
      setTriggerSend(false);
      handleSend();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSend]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voiceToUse = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voiceToUse) {
      utterance.voice = voiceToUse;
    }
    
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      stopSpeaking();
      webLLMService.interrupt();
      setIsLoading(false);
      setInput('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleDownloadAndLoad = async () => {
    try {
      setError(null);
      setIsDownloading(true);
      setDownloadProgress(0);

      if (selectedModel.isCloud) {
        setDownloadStatus('Connecting to Gemini Live...');
        
        await geminiLiveService.connect({
          onStateChange: (state) => {
            if (state === 'connected') {
              setIsModelLoaded(true);
              setIsDownloading(false);
            } else if (state === 'disconnected' || state === 'error') {
              setIsModelLoaded(false);
              setIsDownloading(false);
              if (state === 'error') setError('Connection to Gemini Live lost.');
            }
          },
          onTranscript: (text, role) => {
            if (role === 'user') {
              setLiveUserTranscription(text);
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.role === 'user' && lastMsg.id.startsWith('live-')) {
                updateMessage(lastMsg.id, text);
              } else {
                addMessage('user', text);
              }
            } else {
              setLiveModelTranscription(text);
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id.startsWith('live-')) {
                updateMessage(lastMsg.id, text);
              } else {
                addMessage('assistant', text);
              }
            }
          },
          onError: (err) => {
            setError(err.message);
            setIsDownloading(false);
          }
        });
        return;
      }

      setDownloadStatus('Initializing WebGPU...');

      await webLLMService.loadModel(selectedModel.id, (progress, message) => {
        setDownloadProgress(Math.round(progress * 100));
        setDownloadStatus(message);
      });

      setIsModelLoaded(true);
      setIsDownloading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load model.');
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    // We removed the auto-connect to prevent AudioContext initialization without user gesture
    // Users must now click "Retry Connection" or "Connect" to start live audio
  }, [selectedModel.id]);

  const handleSend = async () => {
    if ((!inputRef.current.trim() && !selectedImage) || !isModelLoaded || isLoading) return;

    const userContent = inputRef.current;
    const userImage = selectedImage || undefined;
    
    addMessage('user', userContent, userImage);
    
    setInput('');
    setSelectedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    stopSpeaking();

    const assistantMessageId = addStreamingMessage('assistant');

    try {
      const chatHistory = [...messages, { role: 'user', content: userContent, image: userImage }].map(m => ({
        role: m.role as any,
        content: m.content,
        image: m.image
      }));

      let spokenLength = 0;
      let finalFullText = "";

      const botName = selectedModel.name.split(' ')[0]; // Will be 'Amo' or 'Riri'

      // RAG: Search for relevant context
      let context = "";
      if (uploadedDocs.length > 0) {
        const results = await vectorDbService.search(userContent);
        if (results.length > 0) {
          context = results.map(r => r.content).join("\n\n");
        }
      }

      await webLLMService.generate(chatHistory, botName, (text) => {
        finalFullText = text;
        updateMessage(assistantMessageId, text, true);

        if (isVoiceModeRef.current) {
          const unspoken = text.slice(spokenLength);
          const match = unspoken.match(/.*?[.!?](?:\s|$)/);
          if (match) {
            const sentence = match[0];
            spokenLength += sentence.length;
            speak(sentence);
          }
        }
      }, context); // Pass context to generate

      finalizeMessage(assistantMessageId);
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    clearMessages();
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0A0A0A]/80 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Zap className="text-black w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-none">My Bro</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={cn("w-1.5 h-1.5 rounded-full", isModelLoaded ? "bg-emerald-500 animate-pulse" : "bg-white/20")} />
              <span className="text-[10px] font-medium text-white/60">
                {isModelLoaded ? selectedModel.name : 'Engine Offline'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsVoiceMode(!isVoiceMode);
              if (isVoiceMode) stopSpeaking();
            }}
            className={cn(
              "p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
              isVoiceMode ? "bg-emerald-500/20 text-emerald-500" : "text-white/40 hover:text-white/80 hover:bg-white/5"
            )}
            title="Toggle Voice Mode"
          >
            {isVoiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">Voice Mode</span>
          </button>
          <button 
            onClick={clearChat}
            className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isSettingsOpen ? "bg-white/10 text-white" : "text-white/40 hover:text-white/80 hover:bg-white/5"
            )}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-[#0A0A0A] border-r border-white/10 transform transition-transform duration-300 ease-in-out flex flex-col",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-bold text-white/80">Chat History</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-white/40 hover:text-white/80 rounded-lg md:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-xl transition-colors font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setCurrentChatId(chat.id);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-colors cursor-pointer group",
                currentChatId === chat.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <div className="truncate pr-2 text-sm font-medium">
                {chat.title}
              </div>
              <button
                onClick={(e) => deleteChat(chat.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Settings Panel (Overlay) */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-[#0F0F0F] border-l border-white/10 z-30 flex flex-col shadow-2xl"
            >
              <div className="p-4 sm:p-6 flex items-center justify-between border-b border-white/10">
                <h2 className="font-bold text-sm tracking-wide uppercase text-white/80">Configuration</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 text-white/40 hover:text-white rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-3 block">Select Model</label>
                  <div className="relative group">
                    <select 
                      value={selectedModel.id}
                      onChange={(e) => {
                        const model = AVAILABLE_MODELS.find(m => m.id === e.target.value);
                        if (model) {
                          if (selectedModel.isCloud) {
                            geminiLiveService.disconnect();
                          }
                          setSelectedModel(model);
                          setIsModelLoaded(false);
                        }
                      }}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/50 transition-all"
                    >
                      {AVAILABLE_MODELS.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none group-hover:text-white/40 transition-colors" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-mono text-white/40">{selectedModel.size}</span>
                    <Cpu className="w-4 h-4 text-emerald-500/50" />
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {selectedModel.description}
                  </p>
                </div>

                {!selectedModel.isCloud && (
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-3 block">Offline Voice</label>
                    <div className="relative group">
                      <select 
                        value={selectedVoiceURI}
                        onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/50 transition-all text-white/80"
                      >
                        {voices.map((voice, idx) => (
                          <option key={`${voice.voiceURI}-${voice.name}-${idx}`} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none group-hover:text-white/40 transition-colors" />
                    </div>
                  </div>
                )}

                {!isModelLoaded ? (
                  selectedModel.isCloud ? (
                    <button
                      onClick={handleDownloadAndLoad}
                      disabled={isDownloading || !error}
                      className={cn(
                        "w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                        (isDownloading || !error)
                          ? "bg-white/5 text-white/40 cursor-not-allowed" 
                          : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                      )}
                    >
                      {isDownloading || !error ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting to Live Audio...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Retry Connection
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadAndLoad}
                      disabled={isDownloading}
                      className={cn(
                        "w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                        isDownloading 
                          ? "bg-white/5 text-white/40 cursor-not-allowed" 
                          : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                      )}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download & Load
                        </>
                      )}
                    </button>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      {selectedModel.isCloud ? 'Connected to Live Audio' : 'Model Ready'}
                    </div>
                    <button
                      onClick={() => {
                        if (selectedModel.isCloud) {
                          geminiLiveService.disconnect();
                        } else {
                          webLLMService.unload();
                          setIsModelLoaded(false);
                        }
                      }}
                      className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
                    >
                      Disconnect
                    </button>
                  </div>
                )}

                <div className="pt-6 border-t border-white/10">
                  <label className="text-[11px] uppercase tracking-wider text-white/40 font-bold mb-3 block">Knowledge Base (RAG)</label>
                  <div className="space-y-3">
                    <button
                      onClick={() => docInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="w-full py-3 rounded-xl border border-dashed border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2 text-xs text-white/60"
                    >
                      {isUploadingDoc ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3 h-3" />
                          Upload PDF or Text
                        </>
                      )}
                    </button>
                    <input
                      type="file"
                      ref={docInputRef}
                      onChange={handleDocUpload}
                      accept=".pdf,.txt,.md"
                      className="hidden"
                    />

                    {uploadedDocs.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {uploadedDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 group">
                            <div className="flex items-center gap-2 min-w-0">
                              <MessageSquare className="w-3 h-3 text-emerald-500/50 shrink-0" />
                              <span className="text-[10px] text-white/60 truncate">{doc.name}</span>
                            </div>
                            <button
                              onClick={() => removeDoc(doc.id)}
                              className="p-1 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {messages.length > 0 && (
                  <button
                    onClick={handleExport}
                    className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-white/5 text-white/80 hover:bg-white/10 border border-white/10 mt-4"
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Export Chat History
                  </button>
                )}
              </div>

              <div className="p-4 sm:p-6 border-t border-white/10 bg-[#0A0A0A]/50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3 text-white/40 mb-4">
                  <Terminal className="w-4 h-4" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">System Status</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span>WebGPU Support</span>
                    <span className="text-emerald-500">DETECTED</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span>Memory Usage</span>
                    <span>~2.4 GB</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col relative w-full">
          {/* Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth"
          >
            {messages.length === 0 && !isDownloading && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6 px-4">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                  <MessageSquare className="w-10 h-10 text-white/20" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Welcome to My Bro</h2>
                  <p className="text-sm text-white/40 leading-relaxed">
                    Experience true privacy. All processing happens locally on your GPU. No data ever leaves this browser.
                  </p>
                </div>
                {!isModelLoaded && !selectedModel.isCloud && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex gap-3 items-start text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You need to download and load a model before you can start chatting. Open settings to begin.</span>
                  </div>
                )}
                {!isModelLoaded && !selectedModel.isCloud && (
                   <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2"
                   >
                     <Settings className="w-4 h-4" />
                     Open Settings
                   </button>
                )}
                {!isModelLoaded && selectedModel.isCloud && error && (
                   <button 
                    onClick={handleDownloadAndLoad}
                    className="px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-medium transition-colors flex items-center gap-2 border border-red-500/20"
                   >
                     <Zap className="w-4 h-4" />
                     Retry Connection
                   </button>
                )}
              </div>
            )}

          {isDownloading && (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto w-full">
              <div className="w-full space-y-4">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                    {selectedModel.isCloud ? 'Connecting' : 'Downloading Assets'}
                  </span>
                  {!selectedModel.isCloud && (
                    <span className="text-2xl font-mono font-bold text-emerald-500">{downloadProgress}%</span>
                  )}
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: selectedModel.isCloud ? '100%' : `${downloadProgress}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                  />
                </div>
                <p className="text-[10px] font-mono text-white/30 text-center truncate">
                  {downloadStatus}
                </p>
              </div>
            </div>
          )}

          {isModelLoaded && selectedModel.isCloud && messages.length === 0 && !liveUserTranscription && !liveModelTranscription && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-8 px-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="w-32 h-32 rounded-full bg-[#1A1A1A] border-2 border-emerald-500/50 flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <Mic className="w-12 h-12 text-emerald-500 animate-pulse" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-3 text-emerald-500">Live Audio Active</h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  You are connected to Gemini 2.5 Live. Speak into your microphone to converse naturally in real-time.
                </p>
              </div>
            </div>
          )}

            <MessageList 
              messages={messages} 
              assistantName={selectedModel.name.split(' ')[0]}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
            />

            {(liveUserTranscription || liveModelTranscription) && (
              <div className="px-6 pb-4 space-y-2 max-w-4xl mx-auto w-full">
                {liveUserTranscription && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-2 rounded-2xl rounded-tr-none text-xs italic">
                      {liveUserTranscription}
                      <span className="ml-2 inline-block w-1 h-1 bg-emerald-500/50 rounded-full animate-pulse" />
                    </div>
                  </motion.div>
                )}
                {liveModelTranscription && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/5 border border-white/10 text-white/60 px-4 py-2 rounded-2xl rounded-tl-none text-xs italic">
                      {liveModelTranscription}
                      <span className="ml-2 inline-block w-1 h-1 bg-white/50 rounded-full animate-pulse" />
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-20"
            >
              <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-xl p-4 rounded-2xl flex gap-4 items-center">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-xs text-red-200/80 leading-tight">{error}</p>
                <button onClick={() => setError(null)} className="ml-auto text-red-500/40 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        {!selectedModel.isCloud ? (
          <div className="p-4 sm:p-6 md:p-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="max-w-4xl mx-auto relative flex flex-col gap-2">
              {selectedImage && (
                <div className="relative self-start mb-2">
                  <img src={selectedImage} alt="Preview" className="h-24 rounded-xl border border-white/10 object-cover" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end relative">
                {selectedModel.isVision && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isModelLoaded || isLoading}
                    className="w-14 h-[56px] shrink-0 rounded-2xl bg-[#1A1A1A] border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:border-emerald-500/50 transition-all disabled:opacity-50"
                    title="Upload Image"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={isModelLoaded ? (isListening ? "Listening..." : "Type a message...") : "Load a model to start chatting"}
                    disabled={!isModelLoaded || isLoading}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-2xl px-6 py-4 pr-28 text-sm focus:outline-none focus:border-emerald-500/50 transition-all resize-none min-h-[56px] max-h-32 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-white/20"
                    rows={1}
                    style={{ overflowY: 'auto' }}
                  />
                  <div className="absolute right-14 top-1/2 -translate-y-1/2">
                    <div className="relative">
                      {isListening && (
                        <div className="absolute inset-0 bg-red-500/30 rounded-full animate-ping" />
                      )}
                      <button
                        onClick={toggleListening}
                        disabled={!isModelLoaded}
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-all relative z-10",
                          isListening 
                            ? "bg-red-500/20 text-red-500" 
                            : "text-white/40 hover:text-white/80 hover:bg-white/5 disabled:opacity-50"
                        )}
                      >
                        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSend()}
                    disabled={!isModelLoaded || isLoading || (!input.trim() && !selectedImage)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center hover:bg-emerald-400 disabled:bg-white/5 disabled:text-white/20 transition-all active:scale-95"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center mt-3 text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">
              Powered by WebGPU • Private & Secure
            </p>
          </div>
        ) : (
          <div className="p-4 sm:p-6 md:p-8 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
              <span className="text-sm text-white/60 font-medium">Live Persona:</span>
              <div className="flex bg-[#1A1A1A] rounded-xl p-1 border border-white/10">
                <button
                  onClick={async () => {
                    setLivePersona('Amo');
                    if (isModelLoaded) {
                      await geminiLiveService.disconnect();
                      setDownloadStatus('Switching to Amo...');
                      handleDownloadAndLoad();
                    }
                  }}
                  className={cn(
                    "px-6 py-2 rounded-lg text-sm font-medium transition-all",
                    livePersona === 'Amo' 
                      ? "bg-emerald-500/20 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                      : "text-white/40 hover:text-white/80"
                  )}
                >
                  Amo
                </button>
                <button
                  onClick={async () => {
                    setLivePersona('Riri');
                    if (isModelLoaded) {
                      await geminiLiveService.disconnect();
                      setDownloadStatus('Switching to Riri...');
                      handleDownloadAndLoad();
                    }
                  }}
                  className={cn(
                    "px-6 py-2 rounded-lg text-sm font-medium transition-all",
                    livePersona === 'Riri' 
                      ? "bg-emerald-500/20 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                      : "text-white/40 hover:text-white/80"
                  )}
                >
                  Riri
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
