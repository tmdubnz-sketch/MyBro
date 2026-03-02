/**
 * A simple energy-based Voice Activity Detection (VAD) processor.
 * It monitors the audio energy and notifies the main thread when speech is detected.
 */
class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.05; // Increased energy threshold for speech detection to prevent background noise triggers
    this.silenceTimeout = 1500; // ms of silence before stopping
    this.lastSpeechTime = 0;
    this.isSpeaking = false;
    this.bufferSize = 16000 * 0.1; // 100ms buffer at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    let energy = 0;

    for (let i = 0; i < channelData.length; i++) {
      energy += channelData[i] * channelData[i];
      
      // Fill buffer to send back to main thread if needed
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({ type: 'audio_data', buffer: this.buffer });
        this.bufferIndex = 0;
      }
    }

    energy = Math.sqrt(energy / channelData.length);

    const currentTime = Date.now();

    if (energy > this.threshold) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.port.postMessage({ type: 'speech_start' });
      }
      this.lastSpeechTime = currentTime;
    } else if (this.isSpeaking && currentTime - this.lastSpeechTime > this.silenceTimeout) {
      this.isSpeaking = false;
      this.port.postMessage({ type: 'speech_stop' });
    }

    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);
