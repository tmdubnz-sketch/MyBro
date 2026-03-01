export const MODELS = {
  llm: {
    // Prefer f32 variants for broader Android WebGPU driver compatibility.
    // If the primary model fails to initialize (driver/WebGPU issues), fall back to smaller models.
    amo: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    amoCandidates: [
      'Llama-3.2-1B-Instruct-q4f32_1-MLC',
      'SmolLM2-360M-Instruct-q4f32_1-MLC',
      'SmolLM2-135M-Instruct-q0f32-MLC',
    ],
  },
  tts: {
    kokoro: 'onnx-community/Kokoro-82M-ONNX',
  },
  stt: {
    whisperTinyEn: 'onnx-community/whisper-tiny.en',
  },
  embeddings: {
    miniLm: 'Xenova/all-MiniLM-L6-v2',
  },
} as const;
