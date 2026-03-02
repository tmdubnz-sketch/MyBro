import { pipeline, env, Tensor } from '@xenova/transformers';

// Configure Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export class SpeechT5Service {
  private synthesizer: any = null;
  private speakerEmbeddings: any = null;
  private audioContext: AudioContext | null = null;
  private initPromise: Promise<void> | null = null;

  async init() {
    if (this.synthesizer) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      try {
        console.log('[SpeechT5] Loading model (this may take a while on first run)...');
        
        // 1. Load the text-to-speech pipeline
        // This automatically downloads the ONNX model and tokenizer for SpeechT5
        this.synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
          quantized: false // Use unquantized model for MUCH better audio quality (~500MB download)
        });

        // 2. Load default speaker embeddings
        // SpeechT5 requires a speaker embedding to know what voice to synthesize.
        // We'll use the default speaker embedding provided by Xenova.
        const speakerUrl = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
        const speakerResponse = await fetch(speakerUrl);
        const speakerBuffer = await speakerResponse.arrayBuffer();
        const speakerData = new Float32Array(speakerBuffer);
        
        this.speakerEmbeddings = new Tensor('float32', speakerData, [1, speakerData.length]);
        
        // 3. Setup AudioContext for playback
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        
        console.log('[SpeechT5] Offline TTS Model Loaded Successfully!');
      } catch (error) {
        console.error('[SpeechT5] Failed to load model:', error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  async speak(text: string) {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.synthesizer || !this.speakerEmbeddings || !this.audioContext) {
      throw new Error('SpeechT5 model is not loaded yet.');
    }

    console.log(`[SpeechT5] Generating audio for: "${text}"`);
    
    // Generate audio
    const result = await this.synthesizer(text, {
      speaker_embeddings: this.speakerEmbeddings
    });

    // The result contains audio data and sampling rate
    const audioData = result.audio; // Float32Array
    const sampleRate = result.sampling_rate;

    this.playAudio(audioData, sampleRate);
  }

  private playAudio(pcmData: Float32Array, sampleRate: number) {
    if (!this.audioContext) return;
    
    const audioBuffer = this.audioContext.createBuffer(1, pcmData.length, sampleRate);
    audioBuffer.getChannelData(0).set(pcmData);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();
  }
}

export const speechT5Service = new SpeechT5Service();
