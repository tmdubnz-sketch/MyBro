import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

const isTauriRuntime =
  typeof window !== 'undefined' &&
  (Boolean((window as any).__TAURI__) || Boolean((window as any).__TAURI_INTERNALS__));

// Service workers can interfere with large model downloads/caching in embedded WebViews.
// Keep PWA behavior for the web, but skip SW registration in Tauri.
if (!isTauriRuntime) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
