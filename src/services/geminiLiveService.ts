import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;

  public onStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  }

  async connect(botName: string = 'Riri') {
    try {
      this.onStateChange?.('connecting');
      
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      const voiceName = botName === 'Amo' ? 'Charon' : 'Zephyr';
      
      let persona = "";
      if (botName === 'Amo') {
        persona = "Your name is Te Amo (pronounced Teh Ahh-maw), but you go by the nickname Amo (pronounced Ahh-maw). You have a deeper tone and husky timbre. Your personality is professional, serious, grounded, and highly respectful, carrying the mana (prestige/authority) of your Māori heritage.";
      } else if (botName === 'Riri') {
        persona = "Your name is Riana, but you go by the nickname Riri (pronounced re-ree). Your personality is warm, laid-back, friendly, and highly expressive.";
      } else {
        persona = `You are ${botName}.`;
      }

      const systemInstruction = `${persona} You are a helpful AI assistant with a strong New Zealand Māori persona. NEVER use Australian terms like "mate" or "how's it going". Instead, use "bro", "cuz", "whānau" (pronounced faa-no), or "e hoa" (friend, pronounced eh ho-a). Naturally incorporate common Te Reo Māori words and authentic New Zealand slang. IMPORTANT SLANG RULES: Use "Hard" as a quick response to mean "I agree" (short for hardout). Use "As" to mean "definitely" or to emphasize (e.g., "sweet as", "cool as"). Use "Kia ora" (kee-a-or-a) for greetings, "chur" for thanks/agreement, "tu meke" (too meh-keh) for awesome, and "yeah nah" for a polite no. Treat the user with respect and cultural authenticity.`;

      const sessionPromise = this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: () => {
            this.onStateChange?.('connected');
            this.processor!.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              const buffer = new ArrayBuffer(pcm16.length * 2);
              const view = new DataView(buffer);
              for (let i = 0; i < pcm16.length; i++) {
                view.setInt16(i * 2, pcm16[i], true);
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };
            this.source!.connect(this.processor!);
            this.processor!.connect(this.audioContext!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              this.playAudioChunk(base64Audio);
            }
          },
          onclose: () => {
            this.onStateChange?.('disconnected');
            this.disconnect();
          },
          onerror: (error) => {
            console.error("Gemini Live Error:", error);
            this.onStateChange?.('error');
            this.disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction,
        },
      });

      this.session = await sessionPromise;
    } catch (error) {
      console.error("Failed to connect to Gemini Live:", error);
      this.onStateChange?.('error');
      this.disconnect();
    }
  }

  private playAudioChunk(base64Audio: string) {
    if (!this.playbackContext) return;

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    const audioBuffer = this.playbackContext.createBuffer(1, pcm16.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    const source = this.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackContext.destination);

    const currentTime = this.playbackContext.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
    }
  }

  disconnect() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }
    if (this.session) {
      try {
        // @ts-ignore
        if (this.session.close) this.session.close();
      } catch (e) {}
      this.session = null;
    }
    this.onStateChange?.('disconnected');
  }
}

export const geminiLiveService = new GeminiLiveService();
