import { MODELS } from '../config/models';
import * as webllm from '@mlc-ai/web-llm';

export type DiagnosticsReport = {
  webgpu: { ok: boolean; detail: string };
  webllm: { ok: boolean; detail: string; modelId: string };
  ttsSystem: { ok: boolean; detail: string };
  ttsKokoro: { ok: boolean; detail: string; modelId: string };
  sttWhisper: { ok: boolean; detail: string; modelId: string };
  embeddings: { ok: boolean; detail: string; modelId: string };
  pdfWorker: { ok: boolean; detail: string };
  opfs: { ok: boolean; detail: string };
};

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const report: DiagnosticsReport = {
    webgpu: { ok: false, detail: 'unknown' },
    webllm: { ok: false, detail: 'unknown', modelId: MODELS.llm.amo },
    ttsSystem: { ok: false, detail: 'unknown' },
    ttsKokoro: { ok: true, detail: 'lazy (init on demand)', modelId: MODELS.tts.kokoro },
    sttWhisper: { ok: true, detail: 'lazy (init on demand)', modelId: MODELS.stt.whisperTinyEn },
    embeddings: { ok: true, detail: 'lazy (init on demand)', modelId: MODELS.embeddings.miniLm },
    pdfWorker: { ok: true, detail: 'bundled worker', },
    opfs: { ok: false, detail: 'unknown' },
  };

  // WebGPU
  try {
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    report.webgpu = { ok: !!hasWebGPU, detail: hasWebGPU ? 'navigator.gpu available' : 'navigator.gpu missing' };

    if (hasWebGPU) {
      const adapter = await (navigator as any).gpu.requestAdapter?.();
      if (!adapter) {
        report.webgpu = { ok: false, detail: 'navigator.gpu.requestAdapter returned null' };
      } else {
        let info = '';
        try {
          const adapterInfo = await (adapter as any).requestAdapterInfo?.();
          if (adapterInfo) info = `${adapterInfo.vendor ?? ''} ${adapterInfo.architecture ?? ''} ${adapterInfo.device ?? ''}`.trim();
        } catch {
          // ignore
        }
        report.webgpu = {
          ok: true,
          detail: info ? `adapter: ${info}` : 'adapter acquired',
        };
      }
    }
  } catch (e: any) {
    report.webgpu = { ok: false, detail: e?.message ?? String(e) };
  }

  // WebLLM model existence
  try {
    const list = (webllm as any)?.prebuiltAppConfig?.model_list as any[] | undefined;
    if (list) {
      const ok = list.some((m) => m?.model_id === MODELS.llm.amo);
      report.webllm = { ok, detail: ok ? 'model_id found in prebuilt list' : 'model_id NOT found in prebuilt list', modelId: MODELS.llm.amo };
    } else {
      report.webllm = { ok: false, detail: 'prebuiltAppConfig.model_list missing', modelId: MODELS.llm.amo };
    }
  } catch (e: any) {
    report.webllm = { ok: false, detail: e?.message ?? String(e), modelId: MODELS.llm.amo };
  }

  // System TTS
  try {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    report.ttsSystem = { ok, detail: ok ? 'speechSynthesis available' : 'speechSynthesis unavailable' };
  } catch (e: any) {
    report.ttsSystem = { ok: false, detail: e?.message ?? String(e) };
  }

  // OPFS
  try {
    const ok = typeof navigator !== 'undefined' && !!(navigator as any).storage?.getDirectory;
    report.opfs = { ok, detail: ok ? 'navigator.storage.getDirectory available' : 'OPFS not available' };
  } catch (e: any) {
    report.opfs = { ok: false, detail: e?.message ?? String(e) };
  }

  return report;
}
