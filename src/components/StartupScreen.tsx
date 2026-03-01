import { useEffect } from "react";

interface StartupScreenProps {
  onReady: () => void;
}

export default function StartupScreen({ onReady }: StartupScreenProps) {
  // Skip startup screen for now - go straight to chat
  // TODO: Re-enable model download when Tauri invoke works
  useEffect(() => {
    console.log('[Startup] Loading app...');
    onReady();
  }, [onReady]);

  return null;
}
