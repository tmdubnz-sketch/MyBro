import * as webllm from "@mlc-ai/web-llm";

export type ProgressCallback = (progress: number, message: string) => void;

class WebLLMService {
  private engine: webllm.MLCEngineInterface | null = null;
  private currentModelId: string | null = null;

  async loadModel(modelId: string, onProgress: ProgressCallback) {
    if (this.engine && this.currentModelId === modelId) {
      return;
    }

    if (this.engine) {
      await this.engine.unload();
    }

    const initProgressCallback = (report: webllm.InitProgressReport) => {
      onProgress(report.progress, report.text);
    };

    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback,
    });
    this.currentModelId = modelId;
  }

  async generate(
    messages: { role: string; content: string }[],
    onUpdate: (text: string) => void
  ) {
    if (!this.engine) throw new Error("Engine not initialized");

    const systemMessage = {
      role: "system",
      content: "You are amo, a highly responsive AI with a strong New Zealand Māori persona. Keep answers brief, natural, and conversational. Speak with warm, laid-back Kiwi attitude and humor. Naturally incorporate common Te Reo Māori words and New Zealand slang (like 'Kia ora', 'chur', 'sweet as', 'whānau', 'tu meke', 'yeah nah'). Avoid markdown formatting like bold or lists, as your responses will be spoken out loud."
    };

    const chunks = await this.engine.chat.completions.create({
      messages: [systemMessage, ...messages] as any,
      stream: true,
      temperature: 0.5,
      max_tokens: 256,
    });

    let fullText = "";
    for await (const chunk of chunks) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullText += content;
      onUpdate(fullText);
    }
    return fullText;
  }

  async interrupt() {
    if (this.engine) {
      await this.engine.interruptGenerate();
    }
  }

  async unload() {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModelId = null;
    }
  }
}

export const webLLMService = new WebLLMService();
