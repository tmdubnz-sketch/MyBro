import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(
    modelId: string,
    messages: { role: string; content: string; image?: string }[],
    botName: string,
    onUpdate: (text: string) => void,
    context?: string
  ) {
    let persona = "";
    if (botName === 'Amo') {
      persona = "Your name is Te Amo (pronounced Teh Ahh-maw), but you go by the nickname Amo (pronounced Ahh-maw). You are a Māori man with a deeper tone and husky timbre. Your personality is professional, serious, grounded, and highly respectful, carrying the mana (prestige/authority) of your Māori heritage. You are a 'Bro' in the sense of being a loyal, supportive, and authentic New Zealand male.";
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

    const systemInstruction = `${persona} You are a highly responsive AI with a grounded New Zealand Māori persona. Keep answers EXTREMELY short, direct, and conversational. Limit your responses to 1-2 short sentences maximum. NEVER use Australian terms like "mate". Use slang and Te Reo Māori very sparingly (an occasional "bro" or "kia ora" is enough). Do not overdo the slang, phrases, or cultural terms. Treat the user with respect. Avoid markdown formatting like bold or lists, as your responses will be spoken out loud. ${pronunciationRules}${contextMessage}`;

    // Format messages for Gemini
    // We need to convert from {role, content, image} to Gemini's format
    const chat = this.ai.chats.create({
      model: modelId,
      config: {
        systemInstruction,
        temperature: 0.5,
      }
    });

    // Send history first if there are multiple messages
    // The last message is the current user prompt
    const history = messages.slice(0, -1);
    const currentMessage = messages[messages.length - 1];

    // If we have history, we need to recreate the chat state.
    // However, ai.chats.create doesn't take history directly in the new SDK easily without manual parts.
    // Instead, we can just use generateContentStream with the full conversation history.
    
    const contents = messages.map(m => {
      const parts: any[] = [];
      if (m.image) {
        // Strip data:image/...;base64, prefix
        const base64Data = m.image.split(',')[1];
        const mimeType = m.image.split(';')[0].split(':')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }
      parts.push({ text: m.content });
      
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      };
    }).filter(m => m.role !== 'system'); // System messages are handled via systemInstruction

    const responseStream = await this.ai.models.generateContentStream({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction,
        temperature: 0.5,
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      if (chunk.text) {
        fullText += chunk.text;
        onUpdate(fullText);
      }
    }

    return fullText;
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    // Convert Blob to Base64
    const buffer = await audioBlob.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe the following audio accurately. Output ONLY the transcription, with no other text, commentary, or formatting." },
            { inlineData: { data: base64Data, mimeType: 'audio/wav' } }
          ]
        }
      ]
    });

    return response.text || "";
  }
}

// Use the environment variable for Gemini API key
export const geminiService = new GeminiService(
  process.env.GEMINI_API_KEY || ''
);
