# My Bro - Multiplatform Production Roadmap (2026 Standards)

## Multiplatform Production Requirements

To deploy **My Bro** as a production-grade multiplatform application in 2026, the following architectural and hardware requirements must be met.

### 1. Hardware & OS Requirements
*   **Mobile (iOS)**: iOS 18+ (Requires A15 Bionic or newer for stable WebGPU memory allocation). Safari 18+ with WebGPU enabled.
*   **Mobile (Android)**: Android 14+. Requires Vulkan-backed WebGPU support (Snapdragon 8 Gen 1 or newer recommended for 2B+ models).
*   **Desktop (Windows/macOS/Linux)**: Chrome 113+, Edge 113+, or Safari 18+. Minimum 4GB Unified Memory/VRAM for 0.5B-1.5B models; 8GB+ recommended for Gemma 2 2B.

### 2. Progressive Web App (PWA) Standards
*   **Service Worker Caching**: Model weights (ranging from 400MB to 1.6GB) must be cached using the Origin Private File System (OPFS) or IndexedDB via the MLC engine. The Service Worker (`workbox`) is configured to cache the WASM binaries and UI assets (up to 10MB chunks).
*   **Manifest**: Must include `display: standalone`, `theme_color`, and maskable icons for native OS integration.
*   **Installability**: App must pass Lighthouse PWA criteria, requiring HTTPS (Secure Context) which is mandatory for both WebGPU and `getUserMedia` (Microphone).

### 3. Audio & Voice Pipeline
*   **Input**: `getUserMedia` with echo cancellation, noise suppression, and auto-gain control enabled.
*   **Processing**: Prefer `AudioWorklet` where supported; fall back to safe main-thread processing when needed.
*   **Latency**: Local TTS should start promptly after response generation; keep UI responsive during model load.

### 4. Security & Privacy
*   **Local Models**: 100% of data remains on-device. No telemetry or network requests are made during local inference.
*   **Cloud Models**: No cloud model integration is included by default.

---

## Development Roadmap

### Phase 1: Foundation (Completed)
- [x] WebGPU Local Inference (WebLLM)
- [x] Responsive, Mobile-First UI
- [x] PWA Configuration for Desktop/Mobile Installation
- [x] Chunked TTS for low-latency local voice

### Phase 2: Enhanced Capabilities (Completed)
- [x] **AudioWorklet Migration**: Replace `ScriptProcessorNode` with `AudioWorklet` to prevent audio stuttering during heavy UI rendering.
- [x] **Local RAG (Retrieval-Augmented Generation)**: Implement OPFS-backed SQLite vector database to allow users to upload PDFs and documents for the local model to read without sending data to the cloud.
- [ ] **Vision Capabilities**: Integrate a local vision model (TBD) for image analysis.
- [x] **Thread Management**: Add a sidebar history to save, resume, and delete past conversations using localStorage.

### Phase 3: Native Packaging & Distribution (Completed)
- [x] **Desktop App**: Wrapped the PWA using **Tauri v2** for lightweight, native desktop applications (Windows/macOS/Linux) with deep OS integration.
- [ ] **Mobile App Stores**: Use **Tauri** to package the application for the Apple App Store and Google Play Store.
- [ ] **Background Execution**: Implement background audio processing so My Bro can continue speaking or listening while the app is minimized on mobile devices.
