import { pipeline as hfPipeline, env as hfEnv } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { MODELS } from '../config/models';

export type VoiceId = 'amo' | 'riri';

export type VoiceSwitchMode = 'voice-clone' | 'voice-switch';

export interface VoiceSwitchConfig {
  sourceVoice: 'clone' | VoiceId;
  targetVoice: VoiceId;
  outputFormat: 'mp3' | 'wav';
}

class VoiceSwitchService {
  private whisperPipeline: any = null;
  private kokoroTTS: any = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private ttsProvider: 'system' | 'kokoro' = 'kokoro';

  constructor() {
    hfEnv.useBrowserCache = true;
    if (hfEnv.backends?.onnx?.wasm) {
      hfEnv.backends.onnx.wasm.numThreads = 1;
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log('[VoiceSwitch] Initializing Whisper for alignment...');
        // Use WASM for mobile compatibility - WebGPU has driver issues on some Android devices
        this.whisperPipeline = await hfPipeline(
          'automatic-speech-recognition',
          MODELS.stt.whisperTinyEn,
          { dtype: 'q8', device: 'wasm' }
        );
        console.log('[VoiceSwitch] Initializing Kokoro TTS...');
        try {
          this.kokoroTTS = await KokoroTTS.from_pretrained(MODELS.tts.kokoro, {
            dtype: 'q8',
            device: 'wasm',
          });
        } catch {
          this.kokoroTTS = await KokoroTTS.from_pretrained(MODELS.tts.kokoro, {
            dtype: 'q8',
            device: 'wasm',
          });
        }
        this.isInitialized = true;
        console.log('[VoiceSwitch] Voice switch service ready');
      } catch (err) {
        console.error('[VoiceSwitch] Init failed:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  async switchVoice(
    audioBlob: Blob,
    config: VoiceSwitchConfig,
    onProgress?: (progress: number, status: string) => void
  ): Promise<Blob> {
    if (!this.isInitialized) {
      await this.init();
    }

    onProgress?.(0, 'Transcribing audio...');

    const audioBuffer = await audioBlob.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);
    
    const whisperResult = await this.whisperPipeline(audioData, {
      return_timestamps: true,
    });

    const text = whisperResult.text;
    const chunks = whisperResult.chunks || [];

    if (!text || text.trim().length === 0) {
      throw new Error('No speech detected in audio');
    }

    onProgress?.(30, 'Generating new voice...');

    const voiceMap: Record<VoiceId, string> = {
      amo: 'af_sarah',
      riri: 'af_heart',
    };

    const targetVoice = voiceMap[config.targetVoice] || 'af_sarah';
    
    const generatedAudio = await this.kokoroTTS.generate(text, {
      voice: targetVoice,
      speed: 1.0,
    });

    onProgress?.(70, 'Processing audio...');

    const wavBlob = this.audioBufferToWav(generatedAudio, 24000);

    onProgress?.(100, 'Complete!');
    
    return wavBlob;
  }

  private audioBufferToWav(buffer: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * bytesPerSample;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  async getAlignment(
    audioBlob: Blob
  ): Promise<{ text: string; chunks: { text: string; timestamp: [number, number] }[] }> {
    if (!this.whisperPipeline) {
      await this.init();
    }

    const audioBuffer = await audioBlob.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);

    const result = await this.whisperPipeline(audioData, {
      return_timestamps: true,
    });

    return {
      text: result.text,
      chunks: result.chunks || [],
    };
  }

  async generateVoice(
    text: string,
    voiceId: VoiceId,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.kokoroTTS) {
      await this.init();
    }

    onProgress?.(0);

    const voiceMap: Record<VoiceId, string> = {
      amo: 'af_sarah',
      riri: 'af_heart',
    };

    const voice = voiceMap[voiceId] || 'af_sarah';

    onProgress?.(30);

    const generatedAudio = await this.kokoroTTS.generate(text, {
      voice,
      speed: 1.0,
    });

    onProgress?.(80);

    const wavBlob = this.audioBufferToWav(generatedAudio, 24000);

    onProgress?.(100);

    return wavBlob;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

const globalForVoiceSwitchService = globalThis as unknown as {
  __MYBRO_VOICE_SWITCH_SERVICE__?: VoiceSwitchService;
};

const existing = globalForVoiceSwitchService.__MYBRO_VOICE_SWITCH_SERVICE__;
if (!existing) {
  globalForVoiceSwitchService.__MYBRO_VOICE_SWITCH_SERVICE__ = new VoiceSwitchService();
}

export const voiceSwitchService = globalForVoiceSwitchService.__MYBRO_VOICE_SWITCH_SERVICE__!;
