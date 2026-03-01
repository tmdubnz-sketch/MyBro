import { createId } from '../lib/id';

export type Persona = 'Amo' | 'Riri';

const PERSONA_PROMPTS: Record<Persona, string> = {
  Amo: `You are Amo, a helpful AI assistant. You're direct, practical, and concise. You speak in a friendly but professional manner.`,
  Riri: `You are Riri, a warm and friendly AI assistant. You're conversational, empathetic, and supportive. You respond in a caring tone.`
};

export interface CloudLLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

class CloudLLMService {
  private config: CloudLLMConfig | null = null;
  private currentPersona: Persona = 'Amo';

  configure(config: CloudLLMConfig): void {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.endpoint.trim().length > 0;
  }

  setPersona(persona: Persona): void {
    this.currentPersona = persona;
  }

  getPersona(): Persona {
    return this.currentPersona;
  }

  async generate(
    messages: { role: string; content: string }[],
    onChunk?: (text: string) => void
  ): Promise<string> {
    if (!this.config) {
      throw new Error('Cloud LLM not configured');
    }

    const systemMessage = PERSONA_PROMPTS[this.currentPersona];
    const filtered = messages.filter((m) => m.role !== 'system');
    const allMessages = [{ role: 'system', content: systemMessage }, ...filtered];

    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: allMessages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    if (!response.body) {
      throw new Error('Cloud API returned empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            chunks.push(content);
            onChunk?.(content);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return chunks.join('');
  }

  async generateOnce(
    messages: { role: string; content: string }[],
    opts?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    if (!this.config) {
      throw new Error('Cloud LLM not configured');
    }

    const systemMessage = PERSONA_PROMPTS[this.currentPersona];
    const filtered = messages.filter((m) => m.role !== 'system');
    const allMessages = [{ role: 'system', content: systemMessage }, ...filtered];

    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: allMessages,
        temperature: opts?.temperature ?? 0.7,
        max_tokens: opts?.max_tokens ?? 256,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const parsed = await response.json();
    return parsed.choices?.[0]?.message?.content || '';
  }
}

const globalForCloudLLMService = globalThis as unknown as {
  __MYBRO_CLOUD_LLM_SERVICE__?: CloudLLMService;
};

const existing = globalForCloudLLMService.__MYBRO_CLOUD_LLM_SERVICE__;
if (!existing) {
  globalForCloudLLMService.__MYBRO_CLOUD_LLM_SERVICE__ = new CloudLLMService();
}

export const cloudLLMService = globalForCloudLLMService.__MYBRO_CLOUD_LLM_SERVICE__!;
