/// <reference lib="webworker" />

// Standalone Web Worker for MediaPipe image embedding AND community detection.
// Built separately with esbuild so it can be loaded as a classic worker
// from the extension (CSP: script-src 'self').
//
// Message protocol (main → worker):
//   { type: "init", data: { wasmLoaderUrl, wasmBinaryUrl, modelBuffer: ArrayBuffer } }
//   { type: "embed", data: { items: Array<{ localIdx: number, blob: Blob }> } }
//   { type: "detect", data: { flatEmbeddings: Float32Array, n: number, dim: number, threshold: number } }
//   { type: "detectSmart", data: { flatEmbeddings: Float32Array, n: number, dim: number, threshold: number, buckets: number[][] } }
//
// Message protocol (worker → main):
//   { type: "ready" }
//   { type: "results", results: Array<{ localIdx: number, embedding: ArrayBuffer }> }
//   { type: "initError", message: string }
//   { type: "detectionProgress", current: number, total: number }
//   { type: "detectionResults", groups: number[][] }

import { ImageEmbedder } from "@mediapipe/tasks-vision";

let embedder: ImageEmbedder | null = null;

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, data } = event.data;

  if (type === "init") {
    try {
      const { wasmLoaderUrl, wasmBinaryUrl, modelBuffer } = data as {
        wasmLoaderUrl: string;
        wasmBinaryUrl: string;
        modelBuffer: ArrayBuffer;
      };

      // Pre-load the WASM loader JS via importScripts (CSP-safe from extension origin).
      // This is the same workaround as the main thread: load the global manually so
      // MediaPipe can find it, then pass wasmLoaderPath: "" to skip its own injection.
      importScripts(wasmLoaderUrl);

      const vision = {
        wasmLoaderPath: "",
        wasmBinaryPath: wasmBinaryUrl,
      };

      embedder = await ImageEmbedder.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer) },
        quantize: false,
        l2Normalize: true,
        runningMode: "IMAGE",
      });

      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({ type: "initError", message: String(e) });
    }
  }

  if (type === "embed") {
    const { items } = data as {
      items: Array<{ localIdx: number; blob: Blob }>;
    };

    const results: Array<{ localIdx: number; embedding: ArrayBuffer }> = [];

    for (const { localIdx, blob } of items) {
      try {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

        const result = embedder!.embed(imageData);
        if (result?.embeddings?.[0]?.floatEmbedding) {
          // .slice(0) to detach the buffer from any shared backing store before transfer
          const buf = new Float32Array(
            result.embeddings[0].floatEmbedding,
          ).buffer.slice(0);
          results.push({ localIdx, embedding: buf });
        }

        bitmap.close();
      } catch {
        // Skip unprocessable images
      }
    }

    const transferables = results.map((r) => r.embedding);
    self.postMessage({ type: "results", results }, transferables);
  }

  if (type === "detect") {
    const { flatEmbeddings, n, dim, threshold, timestamps } = data as {
      flatEmbeddings: Float32Array;
      n: number;
      dim: number;
      threshold: number;
      timestamps?: number[];
    };

    // Unpack flat buffer back into array of row views (zero-copy)
    const embeddings: Float32Array[] = [];
    for (let i = 0; i < n; i++) {
      embeddings.push(flatEmbeddings.subarray(i * dim, (i + 1) * dim));
    }

    const groups = await workerCommunityDetection(
      embeddings,
      threshold,
      timestamps,
      (current, total) => {
        self.postMessage({ type: "detectionProgress", current, total });
      },
    );
    self.postMessage({ type: "detectionResults", groups });
  }

  if (type === "detectSmart") {
    const { flatEmbeddings, n, dim, threshold, buckets } = data as {
      flatEmbeddings: Float32Array;
      n: number;
      dim: number;
      threshold: number;
      buckets: number[][];
    };

    // Unpack flat buffer into row views (zero-copy)
    const embeddings: Float32Array[] = [];
    for (let i = 0; i < n; i++)
      embeddings.push(flatEmbeddings.subarray(i * dim, (i + 1) * dim));

    const allGroups: number[][] = [];
    for (let bi = 0; bi < buckets.length; bi++) {
      const bucket = buckets[bi];
      // Union-Find over bucket indices
      const parent = bucket.map((_, j) => j);
      const find = (x: number): number =>
        parent[x] === x ? x : (parent[x] = find(parent[x]));
      const union = (a: number, b: number) => {
        parent[find(a)] = find(b);
      };

      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = embeddings[bucket[i]];
          const b = embeddings[bucket[j]];
          let dot = 0;
          for (let k = 0; k < dim; k++) dot += a[k] * b[k];
          if (dot >= threshold) union(i, j);
        }
      }

      const components = new Map<number, number[]>();
      for (let i = 0; i < bucket.length; i++) {
        const root = find(i);
        if (!components.has(root)) components.set(root, []);
        components.get(root)!.push(bucket[i]); // original embedding indices
      }
      for (const [, members] of components)
        if (members.length >= 2) allGroups.push(members);

      if (bi % 100 === 0)
        self.postMessage({ type: "detectionProgress", current: bi + 1, total: buckets.length });
    }

    self.postMessage({ type: "detectionResults", groups: allGroups });
  }
});

// ============================================================
// Community detection helpers (inlined — no browser/extension dependencies)
// Kept in sync with lib/duplicate-detector.ts
// ============================================================

async function workerCommunityDetection(
  embeddings: Float32Array[],
  threshold: number,
  timestamps?: number[],
  onProgress?: (current: number, total: number) => void,
): Promise<number[][]> {
  const n = embeddings.length;
  const dim = embeddings[0].length;

  // Sort by timestamp so nearby photos are adjacent
  const order = Array.from({ length: n }, (_, i) => i);
  if (timestamps) {
    order.sort((a, b) => (timestamps[a] ?? 0) - (timestamps[b] ?? 0));
  }

  const sorted: Float32Array[] = order.map((i) => embeddings[i]);
  const groups: number[][] = [];
  let currentGroup: number[] = [order[0]];

  for (let i = 0; i < n - 1; i++) {
    // Cosine similarity = dot product (embeddings are L2-normalized)
    const a = sorted[i];
    const b = sorted[i + 1];
    let dot = 0;
    for (let k = 0; k < dim; k++) dot += a[k] * b[k];

    if (dot >= threshold) {
      currentGroup.push(order[i + 1]);
    } else {
      if (currentGroup.length >= 2) groups.push(currentGroup);
      currentGroup = [order[i + 1]];
    }

    if (i % 500 === 0) {
      onProgress?.(i + 1, n);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (currentGroup.length >= 2) groups.push(currentGroup);

  groups.sort((a, b) => b.length - a.length);
  return groups;
}
