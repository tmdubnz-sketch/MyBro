import * as webllm from '@mlc-ai/web-llm';
import { MODELS } from '../config/models';
import { cloudLLMService } from './cloudLLMService';

export type Persona = 'Amo' | 'Riri';

function describeUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const msg = typeof err.message === 'string' ? err.message : '';
    return msg.trim() ? msg : err.name;
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
    try {
      const s = JSON.stringify(err);
      if (typeof s === 'string' && s.trim()) return s;
    } catch {
      // ignore
    }
    return Object.prototype.toString.call(err);
  }
  const s = String(err);
  return s.trim() ? s : 'Unknown error';
}

const PERSONA_PROMPTS: Record<Persona, string> = {
  Amo: `You are Amo, a helpful AI assistant. You're direct, practical, and concise. You speak in a friendly but professional manner.`,
  Riri: `You are Riri, a warm and friendly AI assistant. You're conversational, empathetic, and supportive. You respond in a caring tone.`
};

class WebLLMService {
  private engine: webllm.MLCEngineInterface | null = null;
  private currentPersona: Persona = 'Amo';
  private initPromise: Promise<void> | null = null;
  private worker: Worker | null = null;
  private currentModelId: string | null = null;

  async init(
    persona: Persona = 'Amo',
    onProgress?: (progress: number, message: string) => void
  ): Promise<void> {
    if (this.engine) {
      this.currentPersona = persona;
      return;
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init(persona, onProgress).finally(() => {
      // Keep initPromise only while initializing; allow retry on failure.
      if (!this.engine) this.initPromise = null;
    });
    return this.initPromise;
  }

  private async _init(
    persona: Persona,
    onProgress?: (progress: number, message: string) => void
  ): Promise<void> {
    this.currentPersona = persona;

    const progressCallback = (progress: webllm.InitProgressReport) => {
      console.log('[WebLLM]', progress.text);
      onProgress?.(progress.progress, progress.text);
    };

    const candidates = Array.isArray((MODELS.llm as any).amoCandidates)
      ? ((MODELS.llm as any).amoCandidates as string[])
      : [MODELS.llm.amo];

    // Validate candidates exist in the installed WebLLM prebuilt list.
    const list = (webllm as any)?.prebuiltAppConfig?.model_list as any[] | undefined;
    if (list) {
      const missing = candidates.filter((id) => !list.some((m) => m?.model_id === id));
      if (missing.length > 0) {
        console.warn('[WebLLM] Some configured modelIds are missing from prebuiltAppConfig:', missing);
      }
    }
    
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), { type: 'module' });
    }

    let lastErr: unknown = null;
    for (let i = 0; i < candidates.length; i++) {
      const modelId = candidates[i]!;
      try {
        onProgress?.(0, `Initializing model (${i + 1}/${candidates.length}): ${modelId}`);
        this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, modelId, {
          initProgressCallback: progressCallback,
        });
        this.currentModelId = modelId;
        console.log('[WebLLM] Engine initialized with', modelId);
        return;
      } catch (err) {
        lastErr = err;
        this.engine = null;
        this.currentModelId = null;
        console.error('[WebLLM] CreateWebWorkerMLCEngine failed for', modelId, err);
        onProgress?.(0, `Model init failed for ${modelId}. Trying fallback...`);
      }
    }

    throw new Error(
      `WebLLM init failed for all candidates (${candidates.join(', ')}): ${describeUnknownError(lastErr)}`
    );
  }

  private normalizeMessages(messages: { role: string; content: string }[]): { role: string; content: string }[] {
    // WebLLM expects the system prompt (if any) to be the very first message.
    // This service owns the system prompt, so we strip any incoming system messages.
    return messages.filter((m) => m.role !== 'system');
  }

  // generate/generateOnce/interrupt/isReady are defined after isCloudMode below
  // to support auto-switching between local WebLLM and cloud Ollama.

  getModelId(): string | null {
    return this.currentModelId;
  }

  setPersona(persona: Persona): void {
    this.currentPersona = persona;
    cloudLLMService.setPersona(persona);
  }

  getPersona(): Persona {
    return this.currentPersona;
  }

  isCloudMode(): boolean {
    return cloudLLMService.isConfigured();
  }

  async generate(
    messages: { role: string; content: string }[],
    onChunk?: (text: string) => void,
    opts?: { systemPromptAppend?: string }
  ): Promise<string> {
    if (cloudLLMService.isConfigured()) {
      return cloudLLMService.generate(messages, onChunk);
    }
    return this._localGenerate(messages, onChunk, opts);
  }

  async generateOnce(
    messages: { role: string; content: string }[],
    opts?: { temperature?: number; top_p?: number; max_tokens?: number; systemPromptAppend?: string }
  ): Promise<string> {
    if (cloudLLMService.isConfigured()) {
      return cloudLLMService.generateOnce(messages, opts);
    }
    return this._localGenerateOnce(messages, opts);
  }

  private async _localGenerate(
    messages: { role: string; content: string }[],
    onChunk?: (text: string) => void,
    opts?: { systemPromptAppend?: string }
  ): Promise<string> {
    if (!this.engine) {
      throw new Error('Engine not initialized');
    }

    const systemMessage = PERSONA_PROMPTS[this.currentPersona] + (opts?.systemPromptAppend ? `\n\n${opts.systemPromptAppend}` : '');
    const allMessages = [{ role: 'system', content: systemMessage }, ...this.normalizeMessages(messages)];

    const chunks: string[] = [];
    
    const stream = await this.engine.chat.completions.create({
      messages: allMessages as any,
      temperature: 0.7,
      top_p: 0.9,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        chunks.push(content);
        onChunk?.(content);
      }
    }

    return chunks.join('');
  }

  private async _localGenerateOnce(
    messages: { role: string; content: string }[],
    opts?: { temperature?: number; top_p?: number; max_tokens?: number; systemPromptAppend?: string }
  ): Promise<string> {
    if (!this.engine) {
      throw new Error('Engine not initialized');
    }

    const systemMessage = PERSONA_PROMPTS[this.currentPersona] + (opts?.systemPromptAppend ? `\n\n${opts.systemPromptAppend}` : '');
    const allMessages = [{ role: 'system', content: systemMessage }, ...this.normalizeMessages(messages)];

    const res = await this.engine.chat.completions.create({
      messages: allMessages as any,
      temperature: opts?.temperature ?? 0,
      top_p: opts?.top_p ?? 1,
      max_tokens: opts?.max_tokens ?? 256,
    } as any);

    const content = (res as any)?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }

  interrupt(): void {
    if (cloudLLMService.isConfigured()) {
      return; // Cloud doesn't support interrupt
    }
    this.engine?.interruptGenerate();
  }

  isReady(): boolean {
    return cloudLLMService.isConfigured() || this.engine !== null;
  }
}

const globalForWebLLMService = globalThis as unknown as {
  __MYBRO_WEBLLM_SERVICE__?: WebLLMService;
};

// In dev (HMR/React Refresh), an older instance may persist on globalThis.
// If its shape is outdated (e.g. missing newer methods), replace it.
const existing = globalForWebLLMService.__MYBRO_WEBLLM_SERVICE__ as any;
if (!existing || typeof existing.generateOnce !== 'function' || typeof existing.interrupt !== 'function') {
  globalForWebLLMService.__MYBRO_WEBLLM_SERVICE__ = new WebLLMService();
}

export const webLLMService = globalForWebLLMService.__MYBRO_WEBLLM_SERVICE__!;
