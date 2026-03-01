// Voice switching service - placeholder for future implementation
// Currently disabled due to ONNX model loading issues on mobile

export type VoiceId = 'amo' | 'riri';

export type VoiceSwitchMode = 'voice-clone' | 'voice-switch';

export interface VoiceSwitchConfig {
  sourceVoice: 'clone' | VoiceId;
  targetVoice: VoiceId;
  outputFormat: 'mp3' | 'wav';
}

class VoiceSwitchService {
  private isInitialized: boolean = false;

  async init(): Promise<void> {
    console.log('[VoiceSwitch] Disabled - using system TTS');
    this.isInitialized = true;
    return Promise.resolve();
  }

  async switchVoice(
    _audioBlob: Blob,
    _config: VoiceSwitchConfig,
    _onProgress?: (progress: number, status: string) => void
  ): Promise<Blob> {
    throw new Error('Voice switching not available. Use keyboard for chat.');
  }

  async getAlignment(_audioBlob: Blob): Promise<{ text: string; chunks: { text: string; timestamp: [number, number] }[] }> {
    throw new Error('Voice alignment not available');
  }

  async generateVoice(
    _text: string,
    _voiceId: VoiceId,
    _onProgress?: (progress: number) => void
  ): Promise<Blob> {
    throw new Error('Voice generation not available');
  }

  isReady(): boolean {
    return false;
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
