import { MODELS } from '../config/models';

export type VoiceId = 'amo' | 'riri';

export const VOICE_OPTIONS: { id: VoiceId; name: string; description: string }[] = [
  { id: 'amo', name: 'Amo', description: 'Male · Deep · Professional' },
  { id: 'riri', name: 'Riri', description: 'Female · Warm · Friendly' },
];

class VoiceService {
  private selectedVoice: VoiceId = 'amo';
  private systemVoices: SpeechSynthesisVoice[] = [];
  private systemVoicesLoaded: boolean = false;
  private isListening: boolean = false;
  private onTranscript: ((text: string) => void) | null = null;

  private ttsAudioContext: AudioContext | null = null;
  private ttsGain: GainNode | null = null;
  private ttsSource: AudioBufferSourceNode | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      const load = () => {
        const v = synth.getVoices();
        if (v && v.length) {
          this.systemVoices = v;
          this.systemVoicesLoaded = true;
        }
      };
      load();
      synth.onvoiceschanged = () => load();
    }
  }

  async unlockAudio(): Promise<void> {
    if (!this.ttsAudioContext) {
      this.ttsAudioContext = new AudioContext();
      this.ttsGain = this.ttsAudioContext.createGain();
      this.ttsGain.gain.value = 1;
      this.ttsGain.connect(this.ttsAudioContext.destination);
    }
    if (this.ttsAudioContext.state !== 'running') {
      await this.ttsAudioContext.resume();
    }
  }

  async init(): Promise<void> {
    // Using system TTS only - no external models
    console.log('[VoiceService] Using system TTS');
    return Promise.resolve();
  }

  async initKokoro(): Promise<void> {
    // Kokoro disabled
    console.log('[VoiceService] Kokoro disabled');
    return Promise.resolve();
  }

  setVoice(voiceId: VoiceId): void {
    this.selectedVoice = voiceId;
  }

  setTtsProvider(_provider: 'system' | 'kokoro'): void {
    // Only system TTS available
  }

  getCurrentVoice(): VoiceId {
    return this.selectedVoice;
  }

  async startListening(
    onFinalTranscript: (text: string) => void,
    _onPartialTranscript?: (text: string) => void
  ): Promise<void> {
    this.onTranscript = onFinalTranscript;
    if (this.isListening) return;
    throw new Error('Voice input disabled. Use keyboard for now.');
  }

  stopListening(): void {
    this.isListening = false;
  }

  async speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      const voiceMap: Record<VoiceId, string[]> = {
        amo: ['David', 'Mark', 'James', 'Paul', 'Daniel'],
        riri: ['Zira', 'Jessa', 'Susan', 'Hazel', 'Nan'],
      };

      const preferredNames = voiceMap[this.selectedVoice] || voiceMap.amo;
      const voice = this.systemVoices.find((v) =>
        preferredNames.some((name) => v.name.toLowerCase().includes(name.toLowerCase()))
      );
      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = 1.0;
      utterance.pitch = this.selectedVoice === 'amo' ? 0.9 : 1.1;
      utterance.volume = 1;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        console.warn('[VoiceService] TTS error:', e);
        resolve();
      };

      synth.speak(utterance);
    });
  }

  stopSpeaking(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;
  }
}

const globalForVoiceService = globalThis as unknown as {
  __MYBRO_VOICE_SERVICE__?: VoiceService;
};

const existing = globalForVoiceService.__MYBRO_VOICE_SERVICE__;
if (!existing) {
  globalForVoiceService.__MYBRO_VOICE_SERVICE__ = new VoiceService();
}

export const voiceService = globalForVoiceService.__MYBRO_VOICE_SERVICE__!;
