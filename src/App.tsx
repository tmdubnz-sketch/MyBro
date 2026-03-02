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
import { geminiService } from './services/geminiService';
import { documentService } from './services/documentService';
import { vectorDbService } from './services/vectorDbService';
import { useMessages } from './hooks/useMessages';
import { audioCaptureService } from './services/audioCaptureService';
import { speechT5Service } from './services/speechT5Service';
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
    setIsSidebarOpen(false);
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
  const [isOfflineMode, setIsOfflineMode] = useState(true);
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
    // Pre-load offline models on launch to ensure they are fully enabled and ready
    speechT5Service.init().catch(err => {
      console.error('Failed to init SpeechT5:', err);
      setError('Failed to load offline voice model.');
      setIsOfflineMode(false);
    });
    
    vectorDbService.init().catch(err => {
      console.error('Failed to init VectorDB:', err);
    });
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (!selectedVoiceURI && availableVoices.length > 0) {
        // Prioritize Male voices with NZ/AU/GB/US accents
        const maleVoice = availableVoices.find(v => 
          (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('man')) && 
          (v.lang.includes('NZ') || v.lang.includes('AU') || v.lang.includes('GB') || v.lang.includes('US'))
        );
        
        const nzVoice = availableVoices.find(v => v.lang.includes('NZ') || v.lang.includes('AU'));
        const fallbackMale = availableVoices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy'));
        
        setSelectedVoiceURI(
          maleVoice?.voiceURI || 
          fallbackMale?.voiceURI || 
          nzVoice?.voiceURI || 
          availableVoices[0].voiceURI
        );
      }
    };
    
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceURI]);

  useEffect(() => {
    audioCaptureService.onSpeechStart = () => {
      setIsListening(true);
      setInput('Listening...');
    };

    audioCaptureService.onSpeechStop = async (audioBlob: Blob) => {
      setIsListening(false);
      setInput('Processing...');
      try {
        const transcript = await geminiService.transcribe(audioBlob);
        
        // Filter out common Whisper hallucinations on silent/noisy audio
        const lowerTranscript = transcript.trim().toLowerCase();
        const isHallucination = [
          'thank you.',
          'thank you',
          'thank you for watching.',
          'subtitles by amara.org',
          'you',
          'bye.',
          'bye',
          '.'
        ].includes(lowerTranscript) || lowerTranscript.length < 2;

        if (isHallucination) {
          console.log('[STT] Ignored hallucination:', transcript);
          setInput('');
          return;
        }

        setInput(transcript);
        if (isVoiceModeRef.current && transcript.trim()) {
          setTriggerSend(true);
        }
      } catch (err: any) {
        console.error('[STT Error]', err);
        setError('Failed to transcribe audio.');
        setInput('');
      }
    };

    return () => {
      audioCaptureService.stop();
    };
  }, []);

  useEffect(() => {
    if (triggerSend) {
      setTriggerSend(false);
      handleSend();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSend]);

  const speak = async (text: string) => {
    if (isOfflineMode) {
      try {
        await speechT5Service.speak(text);
      } catch (err) {
        console.error('SpeechT5 speak error:', err);
      }
      return;
    }

    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voiceToUse = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (voiceToUse) {
      utterance.voice = voiceToUse;
    }
    
    utterance.pitch = 1.2;
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      audioCaptureService.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      setIsLoading(false);
      setInput('');
      try {
        await audioCaptureService.start();
      } catch (err) {
        setError('Microphone access denied or not available.');
      }
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

      if (selectedModel.family === 'gemini') {
        setIsModelLoaded(true);
        setIsDownloading(false);
        return;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load model.');
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    setError(null);
  }, [selectedModel.id]);

  const handleSend = async () => {
    if ((!inputRef.current.trim() && !selectedImage) || isLoading) return;

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

      if (selectedModel.family === 'gemini') {
        await geminiService.generate(selectedModel.id, chatHistory, botName, (text) => {
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
        }, context);
      }

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
    <div className="flex flex-col h-screen bg-transparent text-[#E0E0E0] font-sans selection:bg-[#ff4e00]/30 relative">
      <div className="atmosphere" />
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 glass-panel z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-[#ff4e00] flex items-center justify-center shadow-[0_0_15px_rgba(255,78,0,0.3)]">
            <Zap className="text-white w-4 h-4 fill-current" />
          </div>
          <div>
            <h1 className="font-serif italic font-semibold text-lg tracking-tight leading-none text-white/90">My Bro</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={cn("w-1.5 h-1.5 rounded-full", isModelLoaded ? "bg-[#ff4e00] animate-pulse" : "bg-white/20")} />
              <span className="micro-label">
                {isModelLoaded ? selectedModel.name : 'Engine Offline'}
              </span>
              {isOfflineMode && (
                <span className="px-1.5 py-0.5 rounded-sm bg-[#ff4e00]/20 text-[#ff4e00] text-[9px] font-bold tracking-widest uppercase ml-1 border border-[#ff4e00]/30">
                  Offline Mode
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOfflineMode(!isOfflineMode)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 hover:bg-black/40 transition-colors"
            title="Toggle Connection Mode"
          >
            <div className={cn(
              "w-8 h-4 rounded-full p-0.5 transition-colors relative",
              isOfflineMode ? "bg-[#ff4e00]" : "bg-emerald-500"
            )}>
              <div className={cn(
                "w-3 h-3 rounded-full bg-white transition-transform absolute top-0.5",
                isOfflineMode ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
            <span className="micro-label !text-inherit tracking-wider font-bold w-14 text-left">
              {isOfflineMode ? 'OFFLINE' : 'ONLINE'}
            </span>
          </button>
          
          <button
            onClick={() => {
              setIsVoiceMode(!isVoiceMode);
              if (isVoiceMode) stopSpeaking();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 hover:bg-black/40 transition-colors"
            title="Toggle Interaction Mode"
          >
            <div className={cn(
              "w-8 h-4 rounded-full p-0.5 transition-colors relative",
              isVoiceMode ? "bg-[#ff4e00]" : "bg-white/20"
            )}>
              <div className={cn(
                "w-3 h-3 rounded-full bg-white transition-transform absolute top-0.5",
                isVoiceMode ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
            <span className="micro-label !text-inherit tracking-wider font-bold w-10 text-left">
              {isVoiceMode ? 'VOICE' : 'TEXT'}
            </span>
          </button>
          <button 
            onClick={clearChat}
            className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={cn(
              "p-2 rounded-full transition-colors",
              isSettingsOpen ? "bg-white/10 text-white" : "text-white/40 hover:text-white/80 hover:bg-white/5"
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 glass-panel border-r border-white/10 transform transition-transform duration-300 ease-in-out flex flex-col",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-serif italic text-white/80 text-lg">Chat History</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-white/40 hover:text-white/80 rounded-full md:hidden">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 text-white/90 hover:bg-white/10 border border-white/10 rounded-full transition-all font-medium text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            New Conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setCurrentChatId(chat.id);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all cursor-pointer group",
                currentChatId === chat.id ? "bg-white/10 text-white shadow-sm" : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <div className="truncate pr-2 text-sm font-medium">
                {chat.title}
              </div>
              <button
                onClick={(e) => deleteChat(chat.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
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
              className="absolute right-0 top-0 bottom-0 w-full sm:w-80 glass-panel border-l border-white/10 z-30 flex flex-col shadow-2xl"
            >
              <div className="p-5 sm:p-6 flex items-center justify-between border-b border-white/10">
                <h2 className="font-serif italic text-lg text-white/90">Configuration</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 text-white/40 hover:text-white rounded-full transition-colors hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-mono text-white/40">{selectedModel.size}</span>
                    <Cpu className="w-4 h-4 text-[#ff4e00]/50" />
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {selectedModel.description}
                  </p>
                </div>

                {!selectedModel.isCloud && (
                  <div>
                    <label className="micro-label mb-3 block">Offline Voice</label>
                    <div className="relative group">
                      <select 
                        value={selectedVoiceURI}
                        onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm appearance-none cursor-pointer focus:outline-none focus:border-[#ff4e00]/50 transition-all text-white/80"
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

                <div className="pt-6 border-t border-white/10">
                  <label className="micro-label mb-3 block">Knowledge Base (RAG)</label>
                  <div className="space-y-3">
                    <button
                      onClick={() => docInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="w-full py-4 rounded-2xl border border-dashed border-white/20 hover:border-[#ff4e00]/50 hover:bg-[#ff4e00]/5 transition-all flex items-center justify-center gap-2 text-xs text-white/60"
                    >
                      {isUploadingDoc ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <DownloadCloud className="w-3.5 h-3.5" />
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
                          <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 group">
                            <div className="flex items-center gap-3 min-w-0">
                              <MessageSquare className="w-3.5 h-3.5 text-[#ff4e00]/50 shrink-0" />
                              <span className="text-xs text-white/70 truncate">{doc.name}</span>
                            </div>
                            <button
                              onClick={() => removeDoc(doc.id)}
                              className="p-1.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-400/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                    className="w-full py-3 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 bg-white/5 text-white/80 hover:bg-white/10 border border-white/10 mt-4"
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Export Chat History
                  </button>
                )}
              </div>

              <div className="p-5 sm:p-6 border-t border-white/10 bg-black/20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3 text-white/40 mb-4">
                  <Terminal className="w-4 h-4" />
                  <span className="micro-label">System Status</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono text-white/60">
                    <span>WebGPU Support</span>
                    <span className="text-[#ff4e00]">DETECTED</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-white/60">
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
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-10 px-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#ff4e00]/20 rounded-full blur-3xl" />
                  <div className="w-32 h-32 rounded-full glass-panel border border-[#ff4e00]/30 flex items-center justify-center relative z-10 shadow-[0_0_40px_rgba(255,78,0,0.15)]">
                    <Zap className="w-10 h-10 text-[#ff4e00]" />
                  </div>
                </div>
                <div>
                  <h2 className="font-serif italic text-3xl mb-4 text-white/90">Kia Ora</h2>
                  <p className="text-sm text-white/50 leading-relaxed font-light">
                    I'm Amo. How can I help you today?
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
        <div className="p-4 sm:p-6 md:p-8 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] relative z-10">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto relative flex flex-col gap-3">
              {selectedImage && (
                <div className="relative self-start mb-2">
                  <img src={selectedImage} alt="Preview" className="h-24 rounded-2xl border border-white/10 object-cover shadow-xl" />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex gap-3 items-end relative">
                {selectedModel.isVision && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isModelLoaded || isLoading}
                    className="w-14 h-[60px] shrink-0 rounded-2xl glass-panel flex items-center justify-center text-white/40 hover:text-white/80 hover:border-[#ff4e00]/50 transition-all disabled:opacity-50"
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
                    placeholder={isListening ? "Listening..." : "Type a message..."}
                    disabled={isLoading}
                    className="w-full glass-panel rounded-3xl px-6 py-4 pr-28 text-[15px] focus:outline-none focus:border-[#ff4e00]/50 transition-all resize-none min-h-[60px] max-h-32 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-white/30 font-light"
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
                        disabled={false}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all relative z-10",
                          isListening 
                            ? "bg-red-500/20 text-red-500" 
                            : "text-white/40 hover:text-white/80 hover:bg-white/10 disabled:opacity-50"
                        )}
                      >
                        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSend()}
                    disabled={isLoading || (!input.trim() && !selectedImage)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-[#ff4e00] text-white flex items-center justify-center hover:opacity-90 disabled:bg-none disabled:bg-white/5 disabled:text-white/20 transition-all active:scale-95 shadow-lg disabled:shadow-none"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center mt-4 micro-label text-white/20">
              Powered by Groq • Lightning Fast Cloud Inference
            </p>
          </div>
      </main>
      </div>
    </div>
  );
}
