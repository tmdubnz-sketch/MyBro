import express from "express";
import { createServer as createViteServer } from "vite";
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const PORT = parseInt(process.env.PORT || "3000", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-live-001';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? 'You are a helpful AI assistant with a strong New Zealand Māori persona. Naturally incorporate common Te Reo Māori words and authentic New Zealand slang.';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

const GEMINI_WS_URL =
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta` +
  `.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

interface ClientSession {
  clientWs: WebSocket;
  geminiWs: WebSocket | null;
  isAlive: boolean;
  sessionId: string;
}

async function startServer() {
  const app = express();

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", model: GEMINI_MODEL });
  });

  const httpServer = http.createServer(app);
  
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ origin }, cb) => {
      if (ALLOWED_ORIGIN === '*' || !origin || origin === ALLOWED_ORIGIN) {
        cb(true);
      } else {
        console.warn(`[WS] Rejected connection from origin: ${origin}`);
        cb(false, 403, 'Forbidden');
      }
    },
  });

  // Heartbeat — prevents Cloud Run from killing idle WS connections
  const HEARTBEAT_MS = 25_000;
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const session = (ws as any).__session as ClientSession | undefined;
      if (!session) return;
      if (!session.isAlive) {
        console.log(`[${session.sessionId}] Heartbeat timeout — terminating`);
        ws.terminate();
        return;
      }
      session.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_MS);

  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    const sessionId = crypto.randomUUID();
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const personaName = url.searchParams.get('persona') || 'Riri';

    const session: ClientSession = {
      clientWs,
      geminiWs: null,
      isAlive: true,
      sessionId,
    };
    (clientWs as any).__session = session;

    console.log(`[WS] Client connected: ${sessionId} (Persona: ${personaName})`);

    connectToGemini(session, personaName);

    // Client → Gemini
    clientWs.on('message', (data: any, isBinary: boolean) => {
      if (!session.geminiWs || session.geminiWs.readyState !== WebSocket.OPEN) {
        return;
      }

      if (isBinary) {
        // Raw PCM16 audio — wrap in Gemini realtime_input format
        const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        session.geminiWs.send(
          JSON.stringify({
            realtime_input: {
              media_chunks: [{ data: pcm.toString('base64'), mime_type: 'audio/pcm;rate=16000' }],
            },
          })
        );
      } else {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'text') {
            session.geminiWs.send(
              JSON.stringify({
                client_content: {
                  turns: [{ role: 'user', parts: [{ text: msg.content }] }],
                  turn_complete: true,
                },
              })
            );
          } else if (msg.type === 'interrupt') {
            session.geminiWs.send(
              JSON.stringify({ client_content: { turn_complete: false } })
            );
          }
        } catch {
          console.warn(`[${sessionId}] Could not parse client message`);
        }
      }
    });

    clientWs.on('pong', () => { session.isAlive = true; });

    clientWs.on('close', (code, reason) => {
      console.log(`[${sessionId}] Client closed: ${code} ${reason}`);
      cleanupSession(session);
    });

    clientWs.on('error', (err) => {
      console.error(`[${sessionId}] Client error:`, err.message);
      cleanupSession(session);
    });
  });

  function connectToGemini(session: ClientSession, personaName: string): void {
    const { sessionId, clientWs } = session;

    if (!GEMINI_API_KEY) {
      const err = 'GEMINI_API_KEY not set — cannot connect to Gemini Live';
      console.error(`[${sessionId}] ${err}`);
      clientWs.send(JSON.stringify({ type: 'error', message: err }));
      return;
    }

    console.log(`[${sessionId}] Connecting to Gemini Live...`);

    const geminiWs = new WebSocket(GEMINI_WS_URL);
    session.geminiWs = geminiWs;

    geminiWs.on('open', () => {
      console.log(`[${sessionId}] Gemini Live connected`);

      let persona = "";
      if (personaName === 'Amo') {
        persona = "Your name is Te Amo (pronounced Teh Ahh-maw), but you go by the nickname Amo (pronounced Ahh-maw). You have a deeper tone and husky timbre. Your personality is professional, serious, grounded, and highly respectful, carrying the mana (prestige/authority) of your Māori heritage.";
      } else {
        persona = "Your name is Riana, but you go by the nickname Riri (pronounced re-ree). Your personality is warm, laid-back, friendly, and highly expressive.";
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
t is soft (like "d") before a, e, o; sharper (like "t") before i, u
Key rules:
Every Māori word ends in a vowel.
Break words into syllables using vowels: e.g., whānau = whā-na-u.
Practice diphthongs (two vowels together) by saying them separately first: au = "a...u", rhymes with "no".
For English words, ensure they are pronounced as proper English but with a natural New Zealand Māori accent.
`;

      const systemInstruction = `${persona} You are a helpful AI assistant with a strong New Zealand Māori persona. NEVER use Australian terms like "mate" or "how's it going". Instead, use "bro", "cuz", "whānau" (pronounced faa-no), or "e hoa" (friend, pronounced eh ho-a). Naturally incorporate common Te Reo Māori words and authentic New Zealand slang. IMPORTANT SLANG RULES: Use "Hard" as a quick response to mean "I agree" (short for hardout). Use "As" to mean "definitely" or to emphasize (e.g., "sweet as", "cool as"). Use "Kia ora" (kee-a-or-a) for greetings, "chur" for thanks/agreement, "tu meke" (too meh-keh) for awesome, and "yeah nah" for a polite no. Treat the user with respect and cultural authenticity. ${pronunciationRules}`;

      const voiceName = personaName === 'Amo' ? 'Charon' : 'Zephyr';

      // Send session setup
      geminiWs.send(
        JSON.stringify({
          setup: {
            model: `models/${GEMINI_MODEL}`,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: { prebuilt_voice_config: { voice_name: voiceName } },
              },
            },
            system_instruction: {
              parts: [{ text: systemInstruction }],
            },
          },
        })
      );

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'connected', sessionId }));
      }
    });

    // Gemini → Client
    geminiWs.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Audio + text parts
        const parts = msg.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            // Forward audio as binary
            const audio = Buffer.from(part.inlineData.data, 'base64');
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(audio, { binary: true });
            }
          }
          if (part.text && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: part.text }));
          }
        }

        // User input transcription
        const userText = msg.serverContent?.inputTranscription?.text;
        if (userText && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'transcript', role: 'user', text: userText }));
        }

        // Turn signals
        if (msg.serverContent?.turnComplete && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'turn_complete' }));
        }
        if (msg.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'interrupted' }));
        }
      } catch (err) {
        console.error(`[${sessionId}] Failed to parse Gemini message:`, err);
      }
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`[${sessionId}] Gemini closed: ${code} ${reason}`);
      session.geminiWs = null;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: `Gemini disconnected: ${code}` }));
      }
    });

    geminiWs.on('error', (err) => {
      console.error(`[${sessionId}] Gemini error:`, err.message);
      session.geminiWs = null;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });
  }

  function cleanupSession(session: ClientSession): void {
    if (session.geminiWs) {
      session.geminiWs.onclose = null;
      if (
        session.geminiWs.readyState === WebSocket.OPEN ||
        session.geminiWs.readyState === WebSocket.CONNECTING
      ) {
        session.geminiWs.close(1000, 'Client disconnected');
      }
      session.geminiWs = null;
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM — shutting down...');
    clearInterval(heartbeat);
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    httpServer.close(() => {
      console.log('[Server] Done');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8_000);
  });
}

startServer();
