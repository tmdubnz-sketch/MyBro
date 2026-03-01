# AGENTS.md (MyBro)

This file is instructions for coding agents working in this repo.

## Quick Context

- App: React 19 + Vite 6 PWA, packaged as a Tauri v2 desktop app.
- Primary goal: local-first AI assistant (WebGPU) with optional voice.
- Key runtime constraints: WebGPU availability, large model assets/caching, PWA service worker updates.

## Commands

Install:

```bash
npm install
```

Development:

```bash
npm run dev            # Vite dev server (frontend)
npm run dev:server     # Express dev server (server.ts via tsx)
```

Lint/typecheck:

```bash
npm run lint           # tsc --noEmit (strict)
```

Build:

```bash
npm run build          # vite build + server build (tsconfig.server.json)
npm run start          # run dist/server.js (Express prod server)
```

Clean:

```bash
npm run clean
```

Tauri:

```bash
npm run tauri dev      # desktop dev
npm run tauri build    # desktop build
```

Tauri Mobile (Android):

```bash
# Requires Android SDK/NDK + an ADB-connected device
npm run tauri android dev
npm run tauri android build
```

Windows note: Tauri Android dev uses symlinks; enable Windows Developer Mode
or grant "Create symbolic links" permission to avoid symlink errors.

Tests:

- No unit/e2e test runner is currently configured (no Vitest/Jest/Playwright found).
- “Run a single test” is therefore not available yet.
- If you add Vitest later, standard patterns would be:

```bash
# (after adding vitest)
npm test               # run all tests
npm test -- foo.test   # run a single file
npm test -- -t "name"  # run a single test by name
```

## Repo Layout (high-signal)

- `src/App.tsx`: main UI (agent selection + chat)
- `src/main.tsx`: React entry + PWA SW registration
- `src/config/models.ts`: single source of truth for model ids
- `src/services/webLLMService.ts`: WebLLM (WebGPU) model init + streaming generation
- `src/workers/webllm.worker.ts`: WebLLM worker entry (keeps UI thread responsive)
- `src/services/voiceService.ts`: Kokoro TTS + on-device STT (Transformers.js/Whisper)
- `src/services/vectorDbService.ts`: SQLite/OPFS vector DB (RAG)
- `src/services/documentService.ts`: PDF/text ingestion
- `src/services/diagnosticsService.ts`: lightweight runtime capability checks
- `src/hooks/useMessages.ts`: message state helpers
- `src/components/MessageList.tsx`: message rendering
- `vite.config.ts`: Vite + PWA (Workbox cache limits, env defines)
- `src-tauri/`: Tauri v2 app

## Cursor/Copilot Rules

- No Cursor rules found (`.cursor/rules/` or `.cursorrules`).
- No Copilot instructions found (`.github/copilot-instructions.md`).

## Code Style / Conventions

### TypeScript

- `strict: true` (see `tsconfig.json`); do not silence errors with `any` unless unavoidable.
- Prefer explicit types for public APIs (service methods, exported functions).
- Prefer unions over enums for small sets (e.g. `type Persona = 'Amo' | 'Riri'`).

### React

- Functional components + hooks only.
- Effects must be idempotent. React Strict Mode in dev may mount/unmount/remount and re-run effects.
  - Service singletons that perform heavy initialization MUST dedupe with an `initPromise`.
- Keep UI state in `useState`, long-lived handles in `useRef`.

### Imports

- Group imports by:
  1) external libs
  2) internal modules (`./services/...`, `./hooks/...`)
  3) styles/assets
- Keep import specifiers sorted within a line when editing existing files.

### Naming

- Components: `PascalCase`.
- Functions/vars: `camelCase`.
- Types/interfaces: `PascalCase`.
- Booleans: `isX`, `hasX`, `canX`.
- Service instances: `fooService`.

### Formatting

- No prettier/eslint config present. Match surrounding style.
- Use double quotes only where the file already uses them; otherwise keep existing convention.
- Prefer early returns to reduce nesting.

### Error Handling

- User-facing errors: prefer toast or inline status text.
- Developer-facing errors: `console.warn` for recoverable, `console.error` for failures.
- Wrap model/voice init in try/catch and leave the UI usable when init fails.

### AI/Model/Voice Integration Rules

- Do not block the UI thread with large synchronous work; use async init and show progress.
- Prefer running the LLM in a WebWorker on mobile.
- Avoid repeated initialization:
  - `webLLMService.init()` and `voiceService.init()` must return the same in-flight promise.
- Assume model downloads can fail due to CORS/auth (401/403) or offline mode.
- Keep model ids and prompts centralized in the relevant service.

### PWA / Service Worker

- PWA uses `vite-plugin-pwa` with Workbox precache.
- Large WASM/model assets can exceed cache limits; adjust `vite.config.ts` if adding bigger artifacts.
- Be careful: SW updates can cause reload loops during dev if you change registration behavior.

## Typical Agent Workflow

1) `npm run lint`
2) Make smallest possible change (prefer localized edits)
3) `npm run lint` again
4) `npm run build` if changes affect runtime bundling
