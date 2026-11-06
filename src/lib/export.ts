import type { RenderPayload } from "./types";
import { SIZES } from "./core";
import { paint } from "./render";
let worker: Worker | undefined;
let workerUnavailable = false;
let serial = 0;
const pending = new Map<
  number,
  {
    resolve: (value: Blob) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function disableWorker(error: Error) {
  workerUnavailable = true;
  worker?.terminate();
  worker = undefined;
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  pending.clear();
}
function rendererWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../render.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    if (event.data.error) {
      disableWorker(Error(event.data.error));
      return;
    }
    pending.delete(event.data.id);
    clearTimeout(job.timer);
    job.resolve(event.data.blob);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    disableWorker(Error("Worker failed"));
  };
  return worker;
}
export async function renderBlob(payload: RenderPayload): Promise<Blob> {
  if (
    !workerUnavailable &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  ) {
    try {
      const active = rendererWorker();
      const id = ++serial;
      return await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(
          () => disableWorker(Error("Render timeout")),
          20000,
        );
        pending.set(id, { resolve, reject, timer });
        try {
          active.postMessage({ id, payload });
        } catch (error) {
          disableWorker(
            error instanceof Error ? error : Error("Worker failed"),
          );
        }
      });
    } catch {
      workerUnavailable = true;
      /* Incompatible workers fall back to the same renderer on the main thread. */
    }
  }
  const [w, h] = SIZES[payload.options.format];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  await paint(ctx, payload);
  return await new Promise((resolve, reject) =>
    c.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("PNG failed"))),
      "image/png",
    ),
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
