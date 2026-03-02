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
    id: "gemini-3-flash-preview",
    name: "Amo (Gemini Flash)",
    description: "Fast cloud model.",
    size: "Cloud",
    family: 'gemini',
    isCloud: true,
    isVision: true
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Amo (Gemini Pro)",
    description: "Advanced reasoning cloud model.",
    size: "Cloud",
    family: 'gemini',
    isCloud: true,
    isVision: true
  }
];
