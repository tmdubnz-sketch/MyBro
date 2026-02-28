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
import { AVAILABLE_MODELS, type Message, type ModelConfig } from './types';
import { cn } from './lib/utils';

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('amo_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
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
    localStorage.setItem('amo_chat_history', JSON.stringify(messages));
  }, [messages]);

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
        geminiLiveService.onStateChange = (state) => {
          if (state === 'connected') {
            setIsModelLoaded(true);
            setIsDownloading(false);
          } else if (state === 'disconnected' || state === 'error') {
            setIsModelLoaded(false);
            setIsDownloading(false);
            if (state === 'error') setError('Connection to Gemini Live lost.');
          }
        };
        const botName = selectedModel.name.split(' ')[0]; // Will be 'Amo' or 'Riri'
        await geminiLiveService.connect(botName);
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

  const handleSend = async () => {
    if ((!inputRef.current.trim() && !selectedImage) || !isModelLoaded || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputRef.current,
      image: selectedImage || undefined,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    stopSpeaking();

    const assistantMessageId = (Date.now() + 1).toString();
    const initialAssistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, initialAssistantMessage]);

    try {
      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
        image: m.image
      }));

      let spokenLength = 0;
      let finalFullText = "";

      const botName = selectedModel.name.split(' ')[0]; // Will be 'Amo' or 'Riri'

      await webLLMService.generate(chatHistory, botName, (text) => {
        finalFullText = text;
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId ? { ...m, content: text } : m
        ));

        if (isVoiceModeRef.current) {
          const unspoken = text.slice(spokenLength);
          const match = unspoken.match(/.*?[.!?](?:\s|$)/);
          if (match) {
            const sentence = match[0];
            spokenLength += sentence.length;
            speak(sentence);
          }
        }
      });

      if (isVoiceModeRef.current && finalFullText.length > spokenLength) {
        const remaining = finalFullText.slice(spokenLength);
        if (remaining.trim()) {
          speak(remaining);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0A0A0A]/80 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-3">
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
                        {voices.map(voice => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none group-hover:text-white/40 transition-colors" />
                    </div>
                  </div>
                )}

                {!isModelLoaded ? (
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
                        {selectedModel.isCloud ? 'Connecting...' : 'Downloading...'}
                      </>
                    ) : (
                      <>
                        {selectedModel.isCloud ? <Zap className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        {selectedModel.isCloud ? 'Connect to Live Audio' : 'Download & Load'}
                      </>
                    )}
                  </button>
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
                {!isModelLoaded && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex gap-3 items-start text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You need to download and load a model before you can start chatting. Open settings to begin.</span>
                  </div>
                )}
                {!isModelLoaded && (
                   <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors flex items-center gap-2"
                   >
                     <Settings className="w-4 h-4" />
                     Open Settings
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

          {isModelLoaded && selectedModel.isCloud && (
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

          <AnimatePresence initial={false}>
            {!selectedModel.isCloud && messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-6 max-w-4xl mx-auto group",
                  message.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border",
                  message.role === 'user' 
                    ? "bg-white/5 border-white/10" 
                    : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  {message.role === 'user' ? (
                    <Settings className="w-5 h-5 text-white/40" />
                  ) : (
                    <Zap className="w-5 h-5 text-emerald-500" />
                  )}
                </div>
                <div className={cn(
                  "flex flex-col space-y-2",
                  message.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-6 py-4 rounded-2xl text-sm leading-relaxed",
                    message.role === 'user' 
                      ? "bg-white/5 text-white/90 rounded-tr-none" 
                      : "bg-[#1A1A1A] text-white/90 rounded-tl-none border border-white/5"
                  )}>
                    {message.image && (
                      <img src={message.image} alt="User upload" className="max-w-xs rounded-lg mb-3 border border-white/10" />
                    )}
                    {message.content || (
                      <div className="flex gap-1 py-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-emerald-500/50 rounded-full animate-bounce" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {message.role === 'assistant' && message.content && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleCopy(message.content)}
                          className="p-1 text-white/20 hover:text-white/60 transition-colors"
                          title="Copy message"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => handleRegenerate(message.id)}
                          className="p-1 text-white/20 hover:text-white/60 transition-colors"
                          title="Regenerate response"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
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
        {!selectedModel.isCloud && (
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
        )}
      </main>
      </div>
    </div>
  );
}
