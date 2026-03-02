/**
 * AudioCaptureService handles low-level audio capture using Web Audio API.
 * It uses an AudioWorklet for Voice Activity Detection (VAD) and captures
 * high-quality audio with echo cancellation and noise suppression.
 */
export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private vadNode: AudioWorkletNode | null = null;
  private audioChunks: Float32Array[] = [];
  private isRecording = false;

  onSpeechStart: (() => void) | null = null;
  onSpeechStop: ((audioBlob: Blob) => void) | null = null;
  onAudioData: ((buffer: Float32Array) => void) | null = null;

  async start() {
    if (this.isRecording) return;

    try {
      // Constraints optimized for Voice Communication (similar to Android's VOICE_COMMUNICATION)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Hard requirement for many STT engines
          channelCount: 1,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      await this.audioContext.audioWorklet.addModule('/vad-processor.js');

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.vadNode = new AudioWorkletNode(this.audioContext, 'vad-processor');

      this.vadNode.port.onmessage = (event) => {
        const { type, buffer, isSpeaking } = event.data;

        if (type === 'speech_start') {
          this.audioChunks = [];
          this.onSpeechStart?.();
        } else if (type === 'speech_stop') {
          const audioBlob = this.exportWav(this.audioChunks);
          this.onSpeechStop?.(audioBlob);
        } else if (type === 'audio_data') {
          if (this.isRecording) {
            this.audioChunks.push(new Float32Array(buffer));
          }
          this.onAudioData?.(buffer);
        }
      };

      this.source.connect(this.vadNode);
      this.isRecording = true;
      console.log('[AudioCapture] Started with Pro constraints');
    } catch (err) {
      console.error('[AudioCapture] Failed to start:', err);
      throw err;
    }
  }

  stop() {
    this.isRecording = false;
    this.vadNode?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    
    this.vadNode = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    console.log('[AudioCapture] Stopped');
  }

  private exportWav(chunks: Float32Array[]): Blob {
    const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // Simple WAV encoding
    const buffer = new ArrayBuffer(44 + result.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + result.length * 2, true);
    // RIFF type
    this.writeString(view, 8, 'WAVE');
    // format chunk identifier
    this.writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, 16000, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, 16000 * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    this.writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, result.length * 2, true);

    // write the PCM samples
    let index = 44;
    for (let i = 0; i < result.length; i++) {
      const s = Math.max(-1, Math.min(1, result[i]));
      view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      index += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const audioCaptureService = new AudioCaptureService();
