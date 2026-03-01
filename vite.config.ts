import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({mode}) => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        workbox: {
          maximumFileSizeToCacheInBytes: 25 * 1024 * 1024 // 25MB - for Whisper/Kokoro models
        },
        manifest: {
          name: 'My Bro',
          short_name: 'My Bro',
          description: 'Local-first AI chat with WebGPU and optional voice',
          theme_color: '#0A0A0A',
          background_color: '#0A0A0A',
          display: 'standalone',
          orientation: 'portrait-primary',
          icons: [
            {
              src: 'icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    // Never inject server secrets into the client bundle.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      // For mobile development, the dev server must be reachable from the device.
      // TAURI_DEV_HOST is set by the Tauri CLI; otherwise listen on all interfaces.
      host: host || true,
      hmr: host 
        ? {
            protocol: 'ws',
            host,
            port: 5174,
          }
        : undefined,
      watch: {
        // Android builds touch generated files under src-tauri/gen; ignoring prevents reload loops.
        ignored: ['**/src-tauri/**', '**/dist/**'],
      },
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  };
});
