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

    const modelList: webllm.ModelRecord[] = [
      {
        model: "https://huggingface.co/mlc-ai/Qwen2-VL-2B-Instruct-q4f16_1-MLC",
        model_id: "Qwen2-VL-2B-Instruct-q4f16_1-MLC",
        model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/qwen2_vl/Qwen2-VL-2B-Instruct-q4f16_1-ctx2k-webgpu.wasm",
      },
      {
        model: "https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC",
        model_id: "gemma-2-2b-it-q4f16_1-MLC",
        model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma2/gemma-2-2b-it-q4f16_1-ctx2k-webgpu.wasm",
      }
    ];

    const appConfig: webllm.AppConfig = {
      model_list: [
        ...(webllm.prebuiltAppConfig?.model_list || []),
        ...modelList,
      ],
    };

    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback,
      appConfig,
    });
    this.currentModelId = modelId;
  }

  async generate(
    messages: { role: string; content: string; image?: string }[],
    botName: string,
    onUpdate: (text: string) => void,
    context?: string
  ) {
    if (!this.engine) throw new Error("Engine not initialized");

    let persona = "";
    if (botName === 'Amo') {
      persona = "Your name is Te Amo (pronounced Teh Ahh-maw), but you go by the nickname Amo (pronounced Ahh-maw). You have a deeper tone and husky timbre. Your personality is professional, serious, grounded, and highly respectful, carrying the mana (prestige/authority) of your Māori heritage.";
    } else if (botName === 'Riri') {
      persona = "Your name is Riana, but you go by the nickname Riri (pronounced re-ree). Your personality is warm, laid-back, friendly, and highly expressive.";
    } else {
      persona = `You are ${botName}.`;
    }

    const pronunciationRules = `
Māori pronunciation is consistent and phonetic, meaning each letter and sound is pronounced the same way every time.
Vowels are short and clear:
a like "ah" in "father"
e like "e" in "bed"
i like "ee" in "see"
o like "o" in "more"
u like "oo" in "moon"
Long vowels (with macrons: ā, ē, ī, ō, ū) are held longer:
ā like "car", ē like "led", ī like "peep", ō like "pork", ū like "loot"
Digraphs (two letters that make one sound):
ng sounds like the "ng" in "sing" — do not say "in-ga"
wh is pronounced like "f" — not the English "w" sound
Special consonants:
r is a soft rolled "r", like a gentle "dd" in "judder" or a kiwi accent on "butter"
o is soft (like "d") before a, e, o; sharper (like "t") before i, u
Key rules:
Every Māori word ends in a vowel.
Break words into syllables using vowels: e.g., whānau = whā-na-u.
Practice diphthongs (two vowels together) by saying them separately first: au = "a...u", rhymes with "no".
For English words, ensure they are pronounced as proper English but with a natural New Zealand Māori accent.
`;

    const contextMessage = context ? `\n\nCONTEXT FROM USER DOCUMENTS:\n${context}\n\nUse the above context to answer the user's question if relevant. If the context doesn't contain the answer, ignore it.` : "";

    const systemMessage = {
      role: "system",
      content: `${persona} You are a highly responsive AI with a strong New Zealand Māori persona. Keep answers brief, natural, and conversational. NEVER use Australian terms like "mate" or "how's it going". Instead, use "bro", "cuz", "whānau" (pronounced faa-no), or "e hoa" (friend, pronounced eh ho-a). Naturally incorporate common Te Reo Māori words and authentic New Zealand slang. IMPORTANT SLANG RULES: Use "Hard" as a quick response to mean "I agree" (short for hardout). Use "As" to mean "definitely" or to emphasize. Use "Kia ora" (kee-a-or-a) for greetings, "chur" for thanks, "tu meke" (too meh-keh) for awesome, and "yeah nah" for a polite no. Treat the user with respect and cultural authenticity. Avoid markdown formatting like bold or lists, as your responses will be spoken out loud. ${pronunciationRules}${contextMessage}`
    };

    const formattedMessages = messages.map(m => {
      if (m.image) {
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content || "Analyze this image." },
            { type: "image_url", image_url: { url: m.image } }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const chunks = await this.engine.chat.completions.create({
      messages: [systemMessage, ...formattedMessages] as any,
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
