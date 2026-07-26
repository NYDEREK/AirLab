/// <reference lib="webworker" />

import { generateBall } from "./generator";
import type {
  GenerationRequest,
  GenerationResponse,
} from "./types";

self.onmessage = async (event: MessageEvent<GenerationRequest>) => {
  const { id, parameters } = event.data;
  try {
    const result = await generateBall(parameters);
    const response: GenerationResponse = { id, ok: true, result };
    self.postMessage(response, {
      transfer: [
        result.positions.buffer,
        result.indices.buffer,
        result.previewPositions.buffer,
        result.previewIndices.buffer,
        result.previewNormals.buffer,
      ],
    });
  } catch (error) {
    const response: GenerationResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};
