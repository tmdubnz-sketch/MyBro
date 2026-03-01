import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// WebLLM worker entry. The handler owns the MLCEngine instance.
const handler = new WebWorkerMLCEngineHandler();

(self as unknown as Worker).onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
