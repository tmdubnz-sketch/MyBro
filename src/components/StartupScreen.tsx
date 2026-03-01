import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface DownloadProgress {
  model_id: string;
  model_name: string;
  downloaded: number;
  total: number;
  percent: number;
  status: "downloading" | "complete" | "error";
}

interface ModelsReady {
  success: boolean;
  message: string;
}

interface ModelState {
  id: string;
  name: string;
  percent: number;
  status: "pending" | "downloading" | "complete" | "error";
  downloaded: number;
  total: number;
}

const MODEL_REGISTRY: Record<string, string> = {
  "whisper-tiny": "Voice Recognition (Whisper Tiny)",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface StartupScreenProps {
  onReady: () => void;
}

export default function StartupScreen({ onReady }: StartupScreenProps) {
  const [phase, setPhase] = useState<"checking" | "downloading" | "ready">("checking");
  const [models, setModels] = useState<ModelState[]>([]);
  const [statusText, setStatusText] = useState("Checking for updates...");
  const [overallPercent, setOverallPercent] = useState(0);
  const [dots, setDots] = useState("");
  const unlistenRefs = useRef<(() => void)[]>([]);

  useEffect(() => {
    const t = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".");
    }, 400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const missing: string[] = await invoke("check_models");

      if (missing.length === 0) {
        setStatusText("All systems ready");
        setOverallPercent(100);
        await delay(900);
        if (!cancelled) onReady();
        return;
      }

      const initialStates: ModelState[] = missing.map(id => ({
        id,
        name: MODEL_REGISTRY[id] ?? id,
        percent: 0,
        status: "pending",
        downloaded: 0,
        total: 0,
      }));
      setModels(initialStates);
      setPhase("downloading");
      setStatusText("Downloading required models");

      const unlisten1 = await listen<DownloadProgress>("download-progress", (event) => {
        const p = event.payload;
        setModels(prev => {
          const updated = prev.map(m =>
            m.id === p.model_id
              ? { ...m, percent: p.percent, status: p.status as any, downloaded: p.downloaded, total: p.total }
              : m
          );
          const total = updated.reduce((sum, m) => sum + m.percent, 0);
          setOverallPercent(Math.round(total / updated.length));
          return updated;
        });
      });

      const unlisten2 = await listen<ModelsReady>("models-ready", async (event) => {
        if (event.payload.success) {
          setStatusText("Ready. Let's go");
          setOverallPercent(100);
          await delay(1200);
          if (!cancelled) onReady();
        }
      });

      unlistenRefs.current = [unlisten1, unlisten2];

      await invoke("start_model_downloads");
    }

    init().catch(err => {
      console.error("Startup error:", err);
      setStatusText("Error during startup");
    });

    return () => {
      cancelled = true;
      unlistenRefs.current.forEach(fn => fn());
    };
  }, [onReady]);

  return (
    <div style={styles.overlay}>
      <div style={styles.blob1} />
      <div style={styles.blob2} />
      <div style={styles.noise} />

      <div style={styles.content}>
        <div style={styles.logoWrap}>
          <div style={styles.avatarRing}>
            <div style={styles.avatar}>🤙</div>
          </div>
          <h1 style={styles.title}>My Bro</h1>
          <p style={styles.subtitle}>Your AI companion</p>
        </div>

        <div style={styles.statusBox}>
          <p style={styles.statusText}>
            {phase === "checking"
              ? `${statusText}${dots}`
              : phase === "downloading"
              ? `${statusText}${dots}`
              : statusText}
          </p>

          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${overallPercent}%` }} />
            <div style={{ ...styles.progressGlow, width: `${overallPercent}%` }} />
          </div>

          <p style={styles.progressPct}>{overallPercent}%</p>
        </div>

        {models.length > 0 && (
          <div style={styles.modelList}>
            {models.map(m => (
              <div key={m.id} style={styles.modelRow}>
                <div style={styles.modelRowTop}>
                  <span style={styles.modelName}>{m.name}</span>
                  <span style={styles.modelStatus}>
                    {m.status === "complete" ? "✓ Done" :
                     m.status === "downloading" ? formatBytes(m.downloaded) + " / " + formatBytes(m.total) :
                     m.status === "error" ? "✗ Failed" :
                     "Waiting..."}
                  </span>
                </div>
                <div style={styles.miniTrack}>
                  <div style={{
                    ...styles.miniFill,
                    width: `${m.percent}%`,
                    background: m.status === "complete"
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : m.status === "error"
                      ? "#ef4444"
                      : "linear-gradient(90deg, #7b35e8, #e040fb)",
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {phase === "downloading" && (
          <p style={styles.note}>
            First launch only — models save locally and never re-download
          </p>
        )}
      </div>
    </div>
  );
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#080808",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    overflow: "hidden",
    fontFamily: "'DM Sans', sans-serif",
  },
  blob1: {
    position: "absolute",
    top: "-10%",
    left: "-10%",
    width: "60vw",
    height: "60vw",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(74,26,138,0.35) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  blob2: {
    position: "absolute",
    bottom: "-15%",
    right: "-10%",
    width: "50vw",
    height: "50vw",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(123,53,232,0.2) 0%, transparent 65%)",
    pointerEvents: "none",
  },
  noise: {
    position: "absolute",
    inset: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
    opacity: 0.4,
    pointerEvents: "none",
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
    padding: "0 32px",
    gap: 40,
  },
  logoWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgba(123,53,232,0.3), rgba(224,64,251,0.3))",
    border: "1px solid rgba(168,85,247,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 40px rgba(123,53,232,0.4), 0 0 80px rgba(123,53,232,0.15)",
  },
  avatar: {
    fontSize: 40,
    lineHeight: 1,
    filter: "drop-shadow(0 0 12px rgba(168,85,247,0.8))",
  },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: "2.4rem",
    fontWeight: 800,
    letterSpacing: "-0.04em",
    background: "linear-gradient(135deg, #c084fc, #e040fb)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "#7a6a9a",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    margin: 0,
  },
  statusBox: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  statusText: {
    fontSize: "0.9rem",
    color: "#c084fc",
    letterSpacing: "0.02em",
    margin: 0,
    minHeight: "1.4em",
  },
  progressTrack: {
    position: "relative",
    width: "100%",
    height: 4,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 100,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    inset: 0,
    height: "100%",
    background: "linear-gradient(90deg, #7b35e8, #a855f7, #e040fb)",
    borderRadius: 100,
    transition: "width 0.4s cubic-bezier(0.25,1,0.5,1)",
  },
  progressGlow: {
    position: "absolute",
    top: -4,
    height: "calc(100% + 8px)",
    background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.6))",
    borderRadius: 100,
    transition: "width 0.4s cubic-bezier(0.25,1,0.5,1)",
    filter: "blur(4px)",
  },
  progressPct: {
    fontSize: "0.75rem",
    color: "#4a3a6a",
    letterSpacing: "0.05em",
    margin: 0,
  },
  modelList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  modelRow: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  modelRowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modelName: {
    fontSize: "0.82rem",
    color: "#e8e0f0",
    fontWeight: 500,
  },
  modelStatus: {
    fontSize: "0.75rem",
    color: "#7a6a9a",
    fontVariantNumeric: "tabular-nums",
  },
  miniTrack: {
    width: "100%",
    height: 3,
    background: "rgba(255,255,255,0.05)",
    borderRadius: 100,
    overflow: "hidden",
  },
  miniFill: {
    height: "100%",
    borderRadius: 100,
    transition: "width 0.3s ease",
  },
  note: {
    fontSize: "0.75rem",
    color: "#4a3a6a",
    textAlign: "center",
    lineHeight: 1.6,
    margin: 0,
    maxWidth: 280,
  },
};
