import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BallParameters,
  GeneratedBall,
  GenerationResponse,
} from "../geometry/types";

export type GeneratorState = "idle" | "building" | "ready" | "error";

export const useBallGenerator = (parameters: BallParameters) => {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const activeRequest = useRef(0);
  const inFlight = useRef(false);
  const [ball, setBall] = useState<GeneratedBall | null>(null);
  const [state, setState] = useState<GeneratorState>("idle");
  const [error, setError] = useState<string | null>(null);

  const attachWorker = useCallback(() => {
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("../geometry/worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<GenerationResponse>) => {
      const response = event.data;
      if (response.id !== activeRequest.current) return;
      inFlight.current = false;
      if (response.ok) {
        setBall(response.result);
        setState("ready");
        setError(null);
      } else {
        setState("error");
        setError(response.error);
      }
    };

    worker.onerror = (event) => {
      inFlight.current = false;
      setState("error");
      setError(event.message || "The geometry worker stopped unexpectedly.");
    };
  }, []);

  useEffect(() => {
    attachWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [attachWorker]);

  useEffect(() => {
    if (inFlight.current) {
      inFlight.current = false;
      attachWorker();
    }
    setState("building");
    setError(null);
    const timeout = window.setTimeout(() => {
      const id = ++requestId.current;
      activeRequest.current = id;
      inFlight.current = true;
      workerRef.current?.postMessage({ id, parameters });
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [attachWorker, parameters]);

  return { ball, state, error };
};
