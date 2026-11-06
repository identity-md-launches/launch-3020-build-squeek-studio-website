/// <reference lib="webworker" />
import { paint } from "./lib/render";
import { SIZES } from "./lib/core";
import type { RenderPayload } from "./lib/types";
self.onmessage = async (
  e: MessageEvent<{ id: number; payload: RenderPayload }>,
) => {
  const { id, payload } = e.data;
  try {
    const [w, h] = SIZES[payload.options.format];
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) throw Error("Canvas unavailable");
    await paint(ctx, payload);
    const blob = await c.convertToBlob({ type: "image/png" });
    self.postMessage({ id, blob });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
