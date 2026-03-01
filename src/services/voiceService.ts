import { pipeline as hfPipeline, env as hfEnv } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { MODELS } from '../config/models';

export type VoiceId = 'amo' | 'riri';

export const VOICE_OPTIONS: { id: VoiceId; name: string; description: string }[] = [
  { id: 'amo', name: 'Amo', description: 'Male · Deep · Professional' },
  { id: 'riri', name: 'Riri', description: 'Female · Warm · Friendly' },
];

class VoiceService {
  private kokoroTTS: any = null;
  private sttPipeline: any = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private sttInitPromise: Promise<void> | null = null;
  private selectedVoice: VoiceId = 'amo';
  private ttsProvider: 'system' | 'kokoro' = 'system';
  private systemVoices: SpeechSynthesisVoice[] = [];
  private systemVoicesLoaded: boolean = false;
  private isListening: boolean = false;
  private onTranscript: ((text: string) => void) | null = null;

  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private hasSpeech: boolean = false;
  private partialTimer: number | null = null;
  private sttBusy: boolean = false;
  private lastPartialText: string = '';
  private stopCaptureFn: (() => void) | null = null;

  private ttsAudioContext: AudioContext | null = null;
  private ttsGain: GainNode | null = null;
  private ttsSource: AudioBufferSourceNode | null = null;

  constructor() {
    // Prefer browser cache; allow remote fetches (models are large).
    hfEnv.useBrowserCache = true;

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
    // Browsers often require a user gesture to start audio output.
    // Call this from a click/tap handler (mic/speaker buttons).
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
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log('[VoiceService] Initializing Kokoro TTS...');
        const modelId = MODELS.tts.kokoro;
        try {
          this.kokoroTTS = await KokoroTTS.from_pretrained(modelId, {
            dtype: 'q8',
            device: 'webgpu',
          });
        } catch {
          // Fallback to WASM if WebGPU is unavailable.
          this.kokoroTTS = await KokoroTTS.from_pretrained(modelId, {
            dtype: 'q8',
            device: 'wasm',
          });
        }
        this.isInitialized = true;
        console.log('[VoiceService] Voice service ready');
      } catch (err) {
        this.kokoroTTS = null;
        console.warn('[VoiceService] Kokoro init failed:', err);
        throw err;
      }
    })().finally(() => {
      // Allow retry if init failed.
      if (!this.isInitialized) {
        this.initPromise = null;
      }
    });

    return this.initPromise;
  }

  async initKokoro(): Promise<void> {
    // Explicit init path for Kokoro only.
    if (this.kokoroTTS) return;
    return this.init();
  }

  setVoice(voiceId: VoiceId): void {
    this.selectedVoice = voiceId;
  }

  setTtsProvider(provider: 'system' | 'kokoro'): void {
    this.ttsProvider = provider;
  }

  getCurrentVoice(): VoiceId {
    return this.selectedVoice;
  }

  async startListening(
    onFinalTranscript: (text: string) => void,
    onPartialTranscript?: (text: string) => void
  ): Promise<void> {
    this.onTranscript = onFinalTranscript;

    if (this.isListening) return;

    // Reset capture state
    this.hasSpeech = false;
    this.lastPartialText = '';

    // Prefer local on-device STT (Whisper via Transformers.js).
    try {
      await this.initStt();
      await this.startWhisperRecording(onPartialTranscript);
      return;
    } catch (err) {
      console.warn('[VoiceService] Local STT unavailable:', err);
    }

    throw new Error('On-device speech-to-text is not available on this device right now.');
  }

  private async initStt(): Promise<void> {
    if (this.sttPipeline) return;
    if (this.sttInitPromise) return this.sttInitPromise;

    this.sttInitPromise = (async () => {
      // whisper-tiny is the smallest generally useful option.
      const modelId = MODELS.stt.whisperTinyEn;
      try {
        this.sttPipeline = await hfPipeline('automatic-speech-recognition', modelId, {
          device: 'webgpu',
        } as any);
      } catch (e) {
        // Fallback to WASM if WebGPU path fails.
        this.sttPipeline = await hfPipeline('automatic-speech-recognition', modelId, {
          device: 'wasm',
        } as any);
      }
    })().finally(() => {
      if (!this.sttPipeline) this.sttInitPromise = null;
    });

    return this.sttInitPromise;
  }

  private resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
    if (inRate === outRate) return input;
    const ratio = inRate / outRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const output = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = input[idx] ?? 0;
      const b = input[idx + 1] ?? a;
      output[i] = a + (b - a) * frac;
    }
    return output;
  }

  private concatChunks(chunks: Float32Array[]): Float32Array {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  private rms(input: Float32Array): number {
    if (input.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      const v = input[i];
      sum += v * v;
    }
    return Math.sqrt(sum / input.length);
  }

  private isLikelyUsefulTranscript(text: string): boolean {
    const t = text.trim();
    if (t.length < 2) return false;
    // Filter common silence hallucinates.
    if (/\b(blank audio|silence|noise)\b/i.test(t)) return false;
    // Require at least two letters.
    const letters = (t.match(/[a-z]/gi) ?? []).length;
    return letters >= 2;
  }

  private async startWhisperRecording(onPartialTranscript?: (text: string) => void): Promise<void> {
    if (!this.sttPipeline) throw new Error('STT pipeline not initialized');
    if (this.stopCaptureFn) return;

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.micStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.lastPartialText = '';
    this.sttBusy = false;
    this.hasSpeech = false;

    this.processor.onaudioprocess = (e) => {
      const buf = e.inputBuffer.getChannelData(0);
      // Copy out of the AudioBuffer.
      this.chunks.push(new Float32Array(buf));

      // Ensure we never route mic audio to speakers.
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0);

      // Simple VAD: mark speech when RMS is above a small threshold.
      if (!this.hasSpeech && this.rms(buf) > 0.015) {
        this.hasSpeech = true;
      }
    };

    this.source.connect(this.processor);
    // Keep the processor alive without echoing mic audio.
    const silent = this.audioContext.createGain();
    silent.gain.value = 0;
    this.processor.connect(silent);
    silent.connect(this.audioContext.destination);

    this.isListening = true;
    console.log('[VoiceService] Recording for local STT...');

    const stopPromise = new Promise<void>((resolve) => {
      this.stopCaptureFn = () => {
        resolve();
      };
    });

    // Best-effort partial transcripts every ~1.5s.
    if (onPartialTranscript) {
      this.partialTimer = window.setInterval(async () => {
        if (!this.isListening) return;
        if (this.sttBusy) return;
        if (this.chunks.length < 2) return;
        if (!this.hasSpeech) return;

        this.sttBusy = true;
        try {
          const joined = this.concatChunks(this.chunks);
          const resampled = this.resampleLinear(joined, this.audioContext?.sampleRate ?? 48000, 16000);
          const result = await this.sttPipeline(resampled);
          const text = (result?.text ?? '').trim();
          if (this.isLikelyUsefulTranscript(text) && text !== this.lastPartialText) {
            this.lastPartialText = text;
            onPartialTranscript(text);
          }
        } catch {
          // Ignore partial failures.
        } finally {
          this.sttBusy = false;
        }
      }, 1500);
    }

    // Auto-stop after a short phrase (hands-free MVP).
    setTimeout(() => this.stopListening(), 3500);

    // Wait until stopped, then transcribe.
    await stopPromise;
    await this.finishTranscription();
  }

  private async finishTranscription(): Promise<void> {
    if (!this.sttPipeline) return;
    if (!this.audioContext) return;

    try {
      if (this.partialTimer) {
        window.clearInterval(this.partialTimer);
        this.partialTimer = null;
      }

      const joined = this.concatChunks(this.chunks);
      if (joined.length === 0) return;

      if (!this.hasSpeech) {
        return;
      }

      const resampled = this.resampleLinear(joined, this.audioContext.sampleRate, 16000);
      const result = await this.sttPipeline(resampled);
      const text = (result?.text ?? '').trim();
      if (this.isLikelyUsefulTranscript(text) && this.onTranscript) this.onTranscript(text);
    } catch (err) {
      console.error('[VoiceService] Transcription error:', err);
    } finally {
      this.cleanupMic();
      this.isListening = false;
    }
  }

  stopListening(): void {
    if (!this.isListening) return;
    this.isListening = false;
    this.stopCaptureFn?.();
    this.stopCaptureFn = null;
  }

  private cleanupMic(): void {
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
    } catch {
      // ignore
    }
    this.processor = null;
    this.source = null;

    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.chunks = [];
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  async speak(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.ttsProvider === 'system') {
      const ok = await this.speakWithSystemTts(trimmed);
      if (ok) return;
      // Fall through to Kokoro if system TTS isn't available.
    }

    if (!this.kokoroTTS) {
      await this.initKokoro();
    }

    const voiceMap: Record<VoiceId, string> = {
      'amo': 'am_michael',
      'riri': 'af_nova',
    };

    try {
      // Ensure audio output is unlocked (must be triggered by a user gesture at least once).
      if (!this.ttsAudioContext) {
        throw new Error('Audio output is locked. Tap the speaker button once to enable sound.');
      }
      if (this.ttsAudioContext.state !== 'running') {
        await this.ttsAudioContext.resume();
      }

      const audio = await this.kokoroTTS.generate(text, {
        voice: voiceMap[this.selectedVoice],
      });

      if (!audio?.audio || typeof audio.sampling_rate !== 'number') {
        throw new Error('Unexpected TTS audio format');
      }

      // Stop any current playback.
      this.stopSpeaking();

      const ctx = this.ttsAudioContext;
      const gain = this.ttsGain;
      if (!ctx || !gain) throw new Error('Audio output not ready');

      const buffer = ctx.createBuffer(1, audio.audio.length, audio.sampling_rate);
      buffer.copyToChannel(audio.audio, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      this.ttsSource = source;

      await new Promise<void>((resolve) => {
        source.onended = () => {
          if (this.ttsSource === source) this.ttsSource = null;
          resolve();
        };
        source.start();
      });
    } catch (err) {
      console.error('[VoiceService] TTS error:', err);
      throw err;
    }
  }

  private async speakWithSystemTts(text: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!('speechSynthesis' in window)) return false;
    if (typeof SpeechSynthesisUtterance === 'undefined') return false;

    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-NZ';

      const voices = this.systemVoicesLoaded ? this.systemVoices : synth.getVoices();
      const preferred = this.selectedVoice === 'amo'
        ? ['en-NZ', 'Microsoft', 'David', 'Mark', 'Guy']
        : ['en-NZ', 'Microsoft', 'Zira', 'Aria', 'Jenny'];

      const v = voices.find((vv) => {
        const name = (vv.name || '').toLowerCase();
        const lang = (vv.lang || '').toLowerCase();
        // Try best-effort language first, then name contains.
        if (preferred[0] && lang.includes(preferred[0].toLowerCase())) return true;
        return preferred.slice(1).some((p) => name.includes(p.toLowerCase()));
      });
      if (v) u.voice = v;

      await new Promise<void>((resolve, reject) => {
        u.onend = () => resolve();
        u.onerror = () => reject(new Error('System TTS failed'));
        synth.speak(u);
      });
      return true;
    } catch {
      return false;
    }
  }

  stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (this.ttsSource) {
      try {
        this.ttsSource.stop();
      } catch {
        // ignore
      }
      this.ttsSource = null;
    }
  }
}

const globalForVoiceService = globalThis as unknown as {
  __MYBRO_VOICE_SERVICE__?: VoiceService;
};

export const voiceService =
  globalForVoiceService.__MYBRO_VOICE_SERVICE__ ??
  (globalForVoiceService.__MYBRO_VOICE_SERVICE__ = new VoiceService());
