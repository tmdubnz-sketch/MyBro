export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: string;
  timestamp: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  size: string;
  family: 'gemma' | 'qwen' | 'gemini';
  isCloud?: boolean;
  isVision?: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: "gemini-live-riri",
    name: "Riri Live Audio",
    description: "Ultra-low latency cloud model with native voice-to-voice.",
    size: "Cloud",
    family: 'gemini',
    isCloud: true
  },
  {
    id: "gemini-live-amo",
    name: "Amo Live Audio",
    description: "Ultra-low latency cloud model with native voice-to-voice (Male).",
    size: "Cloud",
    family: 'gemini',
    isCloud: true
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    name: "Riri 2B",
    description: "Google's lightweight, state-of-the-art model.",
    size: "1.6 GB",
    family: 'gemma'
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    name: "Amo 1.5B",
    description: "Alibaba's highly capable small language model.",
    size: "1.1 GB",
    family: 'qwen'
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    name: "Amo 0.5B",
    description: "Ultra-lightweight model for fast performance.",
    size: "0.4 GB",
    family: 'qwen'
  },
  {
    id: "Qwen2-VL-2B-Instruct-q4f16_1-MLC",
    name: "Amo Vision 2B",
    description: "Multimodal model capable of understanding images.",
    size: "1.5 GB",
    family: 'qwen',
    isVision: true
  }
];
