// src/services/geminiLiveService.ts
// WebSocket client for Gemini Live — relayed via Supabase Edge Function
//
// Usage in your component:
//   import { geminiLiveService } from './geminiLiveService';
//   await geminiLiveService.connect({ onTranscript, onStateChange, onError });

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveConfig {
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
}

// ─── Supabase config ──────────────────────────────────────────────────────────
// WS URL = wss://<project>.supabase.co/functions/v1/<function-name>
// Auth   = publishable key passed as ?apikey= query param
//          (WebSocket handshake doesn't support custom headers in browsers)
const SUPABASE_PROJECT = 'hduqmgzcpazehngrkemo';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Qoz4oUbM8qu1WnN22Hm7nA_G9A7XkGX';
const SUPABASE_WS_URL =
  `wss://${SUPABASE_PROJECT}.supabase.co/functions/v1/gemini-live` +
  `?apikey=${SUPABASE_PUBLISHABLE_KEY}`;

// ─── Inline AudioWorklet ──────────────────────────────────────────────────────
// Loaded as a blob URL — no separate .js file needed, works around CSP.
const WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 4096;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    this._buffer.push(...channel);
    while (this._buffer.length >= this._bufferSize) {
      const chunk = new Float32Array(this._buffer.splice(0, this._bufferSize));
      const pcm16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, chunk[i] * 32768));
      }
      this.port.postMessage({ pcm16 }, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;

// ─── Service ──────────────────────────────────────────────────────────────────

class GeminiLiveService {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private state: ConnectionState = 'disconnected';
  private config: GeminiLiveConfig | null = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  async connect(config: GeminiLiveConfig): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') return;

    this.config = config;
    this.setState('connecting');

    try {
      // 1. Get mic permission first — clear error if iframe blocks it
      await this.requestMicPermission();
      // 2. Init AudioContext after permission granted
      await this.initAudioContext();
      // 3. Connect to Supabase Edge Function relay
      await this.initWebSocket();
      // 4. Start streaming mic audio
      await this.startCapture();

      this.setState('connected');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[GeminiLive] Connection failed:', error.message);
      this.setState('error');
      config.onError?.(error);
      await this.cleanup();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
    this.setState('disconnected');
  }

  sendText(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'text', content: text }));
  }

  interrupt(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'interrupt' }));
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async requestMicPermission(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          throw new Error(
            'Microphone access denied. ' +
            'If running inside an iframe, the parent page needs allow="microphone" on the <iframe> tag.'
          );
        }
        if (err.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
      }
      throw err;
    }
  }

  private async initAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.resume();
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: 16000 });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Load AudioWorklet from blob URL — replaces deprecated ScriptProcessorNode
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await this.audioContext.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(
          'WebSocket connection timed out (10s). ' +
          'Check that the Supabase Edge Function is deployed: ' +
          'supabase functions deploy gemini-live --no-verify-jwt'
        ));
      }, 10_000);

      try {
        this.ws = new WebSocket(SUPABASE_WS_URL);
        this.ws.binaryType = 'arraybuffer';
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to open WebSocket: ${err}`));
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[GeminiLive] Connected via Supabase Edge Function');
      };

      // Wait for the relay to confirm Gemini is also connected
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'connected') {
            resolve();
          }
        } catch {
          // Non-JSON = binary audio, ignore during handshake
        }
        // After initial resolve, hand off to normal handler
        this.ws!.onmessage = (ev) => this.handleMessage(ev);
      };

      this.ws.onclose = (ev) => {
        clearTimeout(timeout);
        console.log(`[GeminiLive] WS closed: ${ev.code} ${ev.reason}`);
        if (this.state === 'connected') {
          this.setState('disconnected');
          this.cleanup();
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(
          `WebSocket error connecting to Supabase. ` +
          `Verify the function is deployed and GEMINI_API_KEY secret is set:\n` +
          `  supabase secrets set GEMINI_API_KEY=your_key`
        ));
      };
    });
  }

  private async startCapture(): Promise<void> {
    if (!this.audioContext || !this.micStream) return;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');

    // Stream PCM chunks to the Supabase relay as binary
    this.workletNode.port.onmessage = (event) => {
      if (this.ws?.readyState === WebSocket.OPEN && event.data.pcm16) {
        this.ws.send((event.data.pcm16 as Int16Array).buffer);
      }
    };

    // Capture only — don't connect to speakers (avoids feedback)
    this.sourceNode.connect(this.workletNode);
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.playAudioChunk(event.data);
      return;
    }

    try {
      const msg = JSON.parse(event.data as string);
      switch (msg.type) {
        case 'transcript':
          this.config?.onTranscript?.(msg.text, msg.role ?? 'assistant');
          break;
        case 'turn_complete':
        case 'interrupted':
          break;
        case 'error':
          this.config?.onError?.(new Error(msg.message ?? 'Unknown relay error'));
          break;
        default:
          console.debug('[GeminiLive] Message:', msg.type);
      }
    } catch {
      console.warn('[GeminiLive] Could not parse message');
    }
  }

  private async playAudioChunk(buffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) return;
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch {
      // Silently ignore decode errors — partial chunks are expected
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.config?.onStateChange?.(state);
  }

  private async cleanup(): Promise<void> {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;

    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.workletNode?.disconnect();
    this.workletNode = null;

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;

    if (this.ws) {
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }
  }
}

export const geminiLiveService = new GeminiLiveService();
