export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  size: string;
  family: 'gemma' | 'qwen' | 'gemini';
  isCloud?: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: "gemini-live",
    name: "Online Chat",
    description: "Ultra-low latency cloud model with native voice-to-voice.",
    size: "Cloud",
    family: 'gemini',
    isCloud: true
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    name: "Offline Small",
    description: "Ultra-lightweight model for fast performance.",
    size: "0.4 GB",
    family: 'qwen'
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    name: "Offline Medium",
    description: "Alibaba's highly capable small language model.",
    size: "1.1 GB",
    family: 'qwen'
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    name: "Offline Large",
    description: "Google's lightweight, state-of-the-art model.",
    size: "1.6 GB",
    family: 'gemma'
  }
];
