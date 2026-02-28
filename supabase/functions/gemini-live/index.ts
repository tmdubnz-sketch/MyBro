// supabase/functions/gemini-live/index.ts
// Gemini Live WebSocket relay — Supabase Edge Function (Deno runtime)
//
// Deploy:
//   supabase functions deploy gemini-live --no-verify-jwt
//
// Set secrets:
//   supabase secrets set GEMINI_API_KEY=your_key_here
//   supabase secrets set SYSTEM_PROMPT="You are a helpful assistant."
//
// Client connects to:
//   wss://hduqmgzcpazehngrkemo.supabase.co/functions/v1/gemini-live?apikey=sb_publishable_Qoz4oUbM8qu1WnN22Hm7nA_G9A7XkGX

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash-live-001';
const SYSTEM_PROMPT = Deno.env.get('SYSTEM_PROMPT') ?? 'You are a helpful, friendly assistant.';

const GEMINI_WS_URL =
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta` +
  `.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// ─── CORS headers (needed for browser WS handshake preflight) ────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Only accept WebSocket upgrade requests
  const upgrade = req.headers.get('upgrade') ?? '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response(
      JSON.stringify({ status: 'ok', model: GEMINI_MODEL }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (!GEMINI_API_KEY) {
    return new Response('GEMINI_API_KEY not configured', { status: 500 });
  }

  // Upgrade the client connection to WebSocket
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);
  const sessionId = crypto.randomUUID();

  console.log(`[${sessionId}] Client connected`);

  // Each session has its own Gemini WebSocket — no shared state
  let geminiWs: WebSocket | null = null;

  // ── Client connected ───────────────────────────────────────────────────────
  clientWs.onopen = () => {
    console.log(`[${sessionId}] Client WS open — connecting to Gemini...`);
    geminiWs = connectToGemini(sessionId, clientWs);
  };

  // ── Client → Gemini ────────────────────────────────────────────────────────
  clientWs.onmessage = (event) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
      console.warn(`[${sessionId}] Gemini not ready, dropping message`);
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      // Binary = raw PCM16 audio from mic
      const pcm = new Uint8Array(event.data);
      const base64 = btoa(String.fromCharCode(...pcm));

      geminiWs.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{ data: base64, mime_type: 'audio/pcm;rate=16000' }],
        },
      }));
    } else {
      // Text/JSON control message
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'text') {
          geminiWs.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: msg.content }] }],
              turn_complete: true,
            },
          }));
        } else if (msg.type === 'interrupt') {
          geminiWs.send(JSON.stringify({ client_content: { turn_complete: false } }));
        }
      } catch {
        console.warn(`[${sessionId}] Could not parse client message`);
      }
    }
  };

  clientWs.onclose = (ev) => {
    console.log(`[${sessionId}] Client closed: ${ev.code} ${ev.reason}`);
    cleanupGemini(geminiWs);
    geminiWs = null;
  };

  clientWs.onerror = (ev) => {
    console.error(`[${sessionId}] Client error:`, ev);
    cleanupGemini(geminiWs);
    geminiWs = null;
  };

  return response;
});

// ─── Gemini Live Connection ───────────────────────────────────────────────────

function connectToGemini(sessionId: string, clientWs: WebSocket): WebSocket {
  const ws = new WebSocket(GEMINI_WS_URL);

  ws.onopen = () => {
    console.log(`[${sessionId}] Gemini Live connected`);

    // Send session setup config
    ws.send(JSON.stringify({
      setup: {
        model: `models/${GEMINI_MODEL}`,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Aoede' },
            },
          },
        },
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
      },
    }));

    // Notify client we're ready
    safeSend(clientWs, JSON.stringify({ type: 'connected', sessionId }));
  };

  // ── Gemini → Client ────────────────────────────────────────────────────────
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(
        typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
      );

      // Audio + text parts from model turn
      const parts: any[] = msg.serverContent?.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          // Decode base64 audio → binary → send to client
          const binary = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(binary.buffer);
          }
        }
        if (part.text) {
          safeSend(clientWs, JSON.stringify({ type: 'transcript', role: 'assistant', text: part.text }));
        }
      }

      // Input transcription (what user said)
      const userText = msg.serverContent?.inputTranscription?.text;
      if (userText) {
        safeSend(clientWs, JSON.stringify({ type: 'transcript', role: 'user', text: userText }));
      }

      // Turn signals
      if (msg.serverContent?.turnComplete) {
        safeSend(clientWs, JSON.stringify({ type: 'turn_complete' }));
      }
      if (msg.serverContent?.interrupted) {
        safeSend(clientWs, JSON.stringify({ type: 'interrupted' }));
      }
    } catch (err) {
      console.error(`[${sessionId}] Failed to parse Gemini message:`, err);
    }
  };

  ws.onclose = (ev) => {
    console.log(`[${sessionId}] Gemini closed: ${ev.code} ${ev.reason}`);
    safeSend(clientWs, JSON.stringify({
      type: 'error',
      message: `Gemini disconnected (${ev.code})`,
    }));
  };

  ws.onerror = (ev) => {
    console.error(`[${sessionId}] Gemini error:`, ev);
    safeSend(clientWs, JSON.stringify({
      type: 'error',
      message: 'Gemini connection error',
    }));
  };

  return ws;
}

function cleanupGemini(ws: WebSocket | null): void {
  if (!ws) return;
  ws.onclose = null;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000, 'Client disconnected');
  }
}

function safeSend(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}
