export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
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
    id: "gemini-live-chat",
    name: "Online Mic Chat",
    description: "Real-time voice conversation with Amo or Riri.",
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
    id: "Qwen2-VL-2B-Instruct-q4f16_1-MLC",
    name: "Amo Vision 2B",
    description: "Multimodal model capable of understanding images.",
    size: "1.5 GB",
    family: 'qwen',
    isVision: true
  }
];
