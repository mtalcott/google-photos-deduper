// Duplicate image detection using MediaPipe Image Embedder.
// Ports the Python DuplicateImageDetector to run in the browser.
//
// Pipeline:
// 1. Fetch thumbnails for media items (skipped for items with cached embeddings)
// 2. Compute L2-normalized embeddings via MediaPipe MobileNet V3
// 3. Group duplicates using fast community detection (cosine similarity)

import type { GpdMediaItem, DuplicateGroup } from "./types";
import { StabilityTracker } from "./scan-log";
import type { ScanLogger } from "./scan-log";

/**
 * Select the best item to keep from a duplicate group.
 * Priority: original quality > higher resolution > oldest upload date.
 */
export function selectDefaultKeep(items: GpdMediaItem[]): string {
  const qualityScore = (x: GpdMediaItem) =>
    x.isOriginalQuality === true ? 2 : x.isOriginalQuality === false ? 0 : 1;
  const best = [...items].sort((a, b) => {
    const qDiff = qualityScore(b) - qualityScore(a);
    if (qDiff !== 0) return qDiff;
    const pxDiff =
      (b.resWidth ?? 0) * (b.resHeight ?? 0) -
      (a.resWidth ?? 0) * (a.resHeight ?? 0);
    if (pxDiff !== 0) return pxDiff;
    return (a.creationTimestamp ?? 0) - (b.creationTimestamp ?? 0);
  });
  return best[0].mediaKey;
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_large/float32/latest/mobilenet_v3_large.tflite";

// Thumbnail height for embedding computation. Larger = more accurate but slower.
const THUMB_HEIGHT = 200;

// ============================================================
// Embedding cache (IndexedDB)
// Keyed by mediaKey. Bump CACHE_VERSION to invalidate all entries
// (e.g. when switching to a different model).
// ============================================================

const EMBEDDING_DB_NAME = "gpd-embeddings";
const EMBEDDING_STORE = "embeddings";
const EMBEDDING_CACHE_VERSION = 1;

function openEmbeddingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(EMBEDDING_DB_NAME, EMBEDDING_CACHE_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EMBEDDING_STORE)) {
        db.createObjectStore(EMBEDDING_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function setCachedEmbedding(
  db: IDBDatabase,
  key: string,
  embedding: Float32Array,
): void {
  try {
    const tx = db.transaction(EMBEDDING_STORE, "readwrite");
    tx.objectStore(EMBEDDING_STORE).put(embedding.buffer.slice(0), key);
  } catch {
    // Ignore cache write errors — cache is best-effort
  }
}

// Returns the set of all keys present in the embedding store.
// Uses getAllKeys() — a single efficient IDB call, no matter how large the store.
function loadCachedEmbeddingKeys(db: IDBDatabase): Promise<Set<string>> {
  return new Promise((resolve) => {
    const req = db
      .transaction(EMBEDDING_STORE, "readonly")
      .objectStore(EMBEDDING_STORE)
      .getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result as string[]));
    req.onerror = () => resolve(new Set());
  });
}

// Loads all cached embedding values in two bulk IDB calls (getAllKeys + getAll),
// then maps them back to candidate indices. Far cheaper than one get() per item.
function loadAllCachedEmbeddings(
  db: IDBDatabase,
  keyToIndex: Map<string, number>,
): Promise<Map<number, Float32Array>> {
  return new Promise((resolve) => {
    const result = new Map<number, Float32Array>();
    const tx = db.transaction(EMBEDDING_STORE, "readonly");
    const store = tx.objectStore(EMBEDDING_STORE);

    let allKeys: string[] | null = null;
    let allValues: unknown[] | null = null;

    const tryResolve = () => {
      if (allKeys === null || allValues === null) return;
      for (let i = 0; i < allKeys.length; i++) {
        const idx = keyToIndex.get(allKeys[i]);
        if (idx !== undefined && allValues[i] instanceof ArrayBuffer) {
          result.set(idx, new Float32Array(allValues[i] as ArrayBuffer));
        }
      }
      resolve(result);
    };

    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      allKeys = keysReq.result as string[];
      tryResolve();
    };
    keysReq.onerror = () => resolve(result);

    const valsReq = store.getAll();
    valsReq.onsuccess = () => {
      allValues = valsReq.result;
      tryResolve();
    };
    valsReq.onerror = () => resolve(result);
  });
}

export interface DetectionProgress {
  phase:
    | "downloading_thumbnails"
    | "computing_embeddings"
    | "detecting_duplicates";
  current: number;
  total: number;
}

export interface ScanTiming {
  totalItems: number;
  candidates: number;
  cacheHits: number;
  fetchThumbnailsMs: number;
  computeEmbeddingsMs: number;
  communityDetectionMs: number;
  totalMs: number;
}

type ProgressCallback = (progress: DetectionProgress) => void;

// ============================================================
// Main entry points
// ============================================================

export async function fullDetectDuplicates(
  mediaItems: GpdMediaItem[],
  threshold: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  logger?: ScanLogger,
): Promise<{ groups: DuplicateGroup[]; timing: ScanTiming }> {
  const scanStart = performance.now();

  // Filter to items with thumbnails (photos only, skip videos)
  const candidates = mediaItems.filter((item) => item.thumb && !item.duration);
  console.log(
    `[GPD] detectDuplicates: ${mediaItems.length} items → ${candidates.length} candidates`,
  );

  const emptyTiming = (extra: Partial<ScanTiming> = {}): ScanTiming => ({
    totalItems: mediaItems.length,
    candidates: candidates.length,
    cacheHits: 0,
    fetchThumbnailsMs: 0,
    computeEmbeddingsMs: 0,
    communityDetectionMs: 0,
    totalMs: Math.round(performance.now() - scanStart),
    ...extra,
  });

  if (candidates.length < 2) return { groups: [], timing: emptyTiming() };

  const keys = candidates.map((item) => item.mediaKey);

  // Open embedding cache DB. Used in two stages below.
  let db: IDBDatabase | null = null;
  try {
    db = await openEmbeddingDb();
  } catch {
    /* cache unavailable */
  }

  // Stage A: get cached key set via a single getAllKeys() call.
  // Only the set of keys is needed here — no embedding values loaded yet.
  // This tells fetchThumbnails which items to skip downloading.
  const cachedKeySet: Set<string> = db
    ? await loadCachedEmbeddingKeys(db)
    : new Set();
  const cacheHits = keys.filter((k) => cachedKeySet.has(k)).length;
  console.log(
    `[GPD] embedding cache: ${cacheHits}/${candidates.length} hits, skipping thumbnails`,
  );

  // Inform logger of candidates/cacheHits now that they're known.
  // Fire-and-forget — runs concurrently with thumbnail fetching.
  logger?.updateInfo({ candidates: candidates.length, cacheHits });

  // Wrap onProgress to feed stability tracking alongside the UI callback.
  const stabilityTracker = new StabilityTracker((est) =>
    logger?.recordStableEstimate(est),
  );
  const trackedProgress: ProgressCallback = (progress) => {
    onProgress?.(progress);
    stabilityTracker.update(progress.phase, progress.current, progress.total);
  };

  // Step 1: Download thumbnails — skip items whose embedding is already cached
  const t1 = performance.now();
  const blobs = await fetchThumbnails(
    candidates,
    cachedKeySet,
    trackedProgress,
    signal,
  );
  const fetchThumbnailsMs = Math.round(performance.now() - t1);
  console.log(
    `[GPD] fetchThumbnails: ${candidates.length - cacheHits} items in ${fetchThumbnailsMs}ms`,
  );
  await logger?.phaseComplete("fetchThumbnailsMs", fetchThumbnailsMs);

  signal?.throwIfAborted();

  // Step 2: Compute embeddings — values loaded in bulk inside computeEmbeddings
  const t2 = performance.now();
  const { embeddings, validIndices } = await computeEmbeddings(
    blobs,
    keys,
    db,
    cachedKeySet,
    trackedProgress,
    signal,
  );
  const computeEmbeddingsMs = Math.round(performance.now() - t2);
  console.log(
    `[GPD] computeEmbeddings: ${embeddings.length} items (${cacheHits} cached) in ${computeEmbeddingsMs}ms`,
  );
  await logger?.phaseComplete("computeEmbeddingsMs", computeEmbeddingsMs);

  if (embeddings.length < 2) {
    return {
      groups: [],
      timing: emptyTiming({ cacheHits, fetchThumbnailsMs, computeEmbeddingsMs }),
    };
  }

  // Step 3: Community detection — runs in a worker to keep UI responsive.
  // The setTimeout(0) yield lets React flush the phase change to "detecting_duplicates"
  // before the worker is dispatched, so the UI updates before the long computation begins.
  // Progress updates come from the worker during detection.
  trackedProgress({ phase: "detecting_duplicates", current: 0, total: 0 });
  await new Promise<void>((r) => setTimeout(r, 0));
  const workerUrl = chrome.runtime.getURL("scripts/embedder-worker.js");
  const timestamps = validIndices.map(
    (i) => candidates[i].creationTimestamp ?? 0,
  );
  const t3 = performance.now();
  const indexGroups = await runCommunityDetectionInWorker(
    embeddings,
    threshold,
    timestamps,
    workerUrl,
    trackedProgress,
    signal,
  );
  const communityDetectionMs = Math.round(performance.now() - t3);
  const totalMs = Math.round(performance.now() - scanStart);
  console.log(
    `[GPD] communityDetection: ${indexGroups.length} groups in ${communityDetectionMs}ms`,
  );
  console.log(`[GPD] scan complete: ${totalMs}ms total`);
  await logger?.phaseComplete("communityDetectionMs", communityDetectionMs);

  // Map indices back to media items and build DuplicateGroup objects
  const groups: DuplicateGroup[] = indexGroups.map((indices, i) => {
    // Sort items by upload date ascending so the oldest is first
    const items = indices
      .map((idx) => candidates[validIndices[idx]])
      .sort((a, b) => (a.creationTimestamp ?? 0) - (b.creationTimestamp ?? 0));
    const mediaKeys = items.map((item) => item.mediaKey);
    return {
      id: `group-${i}`,
      mediaKeys,
      originalMediaKey: selectDefaultKeep(items),
      similarity: threshold, // Approximate; all items are at least this similar
    };
  });

  const timing: ScanTiming = {
    totalItems: mediaItems.length,
    candidates: candidates.length,
    cacheHits,
    fetchThumbnailsMs,
    computeEmbeddingsMs,
    communityDetectionMs,
    totalMs,
  };

  return { groups, timing };
}

// ============================================================
// Smart scan: group by timestamp, embed subset, pairwise union-find
// ============================================================

/**
 * Group media items by their `timestamp` field (EXIF taken date).
 * Only returns buckets with ≥ 2 items.
 *
 * windowMs = 0 (default): exact timestamp match.
 * windowMs > 0: items within the same time window are bucketed together.
 *
 * Exported for unit testing.
 */
export function groupByTimestamp(
  items: GpdMediaItem[],
  windowMs = 0,
): GpdMediaItem[][] {
  const buckets = new Map<number, GpdMediaItem[]>();
  for (const item of items) {
    const key =
      windowMs > 0
        ? Math.floor(item.timestamp / windowMs) * windowMs
        : item.timestamp;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return [...buckets.values()].filter((g) => g.length >= 2);
}

/**
 * Given a single timestamp-bucket group, compute duplicate groups using
 * pairwise cosine similarity + union-find.
 *
 * Exported for unit testing. The worker contains an equivalent inline copy.
 */
export function withinGroupDuplicates(
  groupItems: GpdMediaItem[],
  embeddingMap: Map<string, Float32Array>,
  threshold: number,
  groupIdOffset: number,
): DuplicateGroup[] {
  const withEmb = groupItems
    .map((item) => ({ item, emb: embeddingMap.get(item.mediaKey) }))
    .filter(
      (x): x is { item: GpdMediaItem; emb: Float32Array } => !!x.emb,
    );
  if (withEmb.length < 2) return [];

  // Union-Find
  const parent = withEmb.map((_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const dim = withEmb[0].emb.length;
  for (let i = 0; i < withEmb.length; i++) {
    for (let j = i + 1; j < withEmb.length; j++) {
      let dot = 0;
      for (let k = 0; k < dim; k++) dot += withEmb[i].emb[k] * withEmb[j].emb[k];
      if (dot >= threshold) union(i, j);
    }
  }

  const components = new Map<number, GpdMediaItem[]>();
  for (let i = 0; i < withEmb.length; i++) {
    const root = find(i);
    if (!components.has(root)) components.set(root, []);
    components.get(root)!.push(withEmb[i].item);
  }

  return [...components.values()]
    .filter((g) => g.length >= 2)
    .map((items, i) => {
      const sorted = [...items].sort(
        (a, b) => (a.creationTimestamp ?? 0) - (b.creationTimestamp ?? 0),
      );
      return {
        id: `group-${groupIdOffset + i}`,
        mediaKeys: sorted.map((x) => x.mediaKey),
        originalMediaKey: selectDefaultKeep(items),
        similarity: threshold,
      };
    });
}

/**
 * Packs embeddings and bucket index arrays, sends to worker for pairwise
 * union-find detection. Returns number[][] (group index lists into embeddings[]).
 */
async function runSmartDetectionInWorker(
  embeddings: Float32Array[],
  threshold: number,
  buckets: number[][],
  workerUrl: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<number[][]> {
  const n = embeddings.length;
  if (n === 0) return [];
  const dim = embeddings[0].length;

  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);

  const worker = new Worker(workerUrl);

  return new Promise<number[][]>((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (e) => {
      if (e.data.type === "detectionProgress") {
        onProgress?.({
          phase: "detecting_duplicates",
          current: e.data.current,
          total: e.data.total,
        });
      } else if (e.data.type === "detectionResults") {
        signal?.removeEventListener("abort", onAbort);
        worker.terminate();
        resolve(e.data.groups as number[][]);
      }
    };
    worker.onerror = (e) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(new Error(e.message ?? "Worker error during smart detection"));
    };

    worker.postMessage(
      { type: "detectSmart", data: { flatEmbeddings: flat, n, dim, threshold, buckets } },
      [flat.buffer],
    );
  });
}

export async function smartDetectDuplicates(
  mediaItems: GpdMediaItem[],
  threshold: number,
  windowMs = 1000,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  logger?: ScanLogger,
): Promise<DuplicateGroup[]> {
  const scanStart = performance.now();
  const candidates = mediaItems.filter((item) => item.thumb && !item.duration);

  // Step 1: Bucket by timestamp — no I/O, instant
  const buckets = groupByTimestamp(candidates, windowMs);
  console.log(
    `[GPD] smartDetectDuplicates: ${mediaItems.length} items → ${candidates.length} candidates → ${buckets.length} timestamp buckets`,
  );
  if (buckets.length === 0) return [];

  // Flatten to deduplicated subset
  const seen = new Set<string>();
  const subset: GpdMediaItem[] = [];
  for (const bucket of buckets)
    for (const item of bucket)
      if (!seen.has(item.mediaKey)) {
        seen.add(item.mediaKey);
        subset.push(item);
      }

  const keys = subset.map((item) => item.mediaKey);

  // Open embedding cache
  let db: IDBDatabase | null = null;
  try {
    db = await openEmbeddingDb();
  } catch {
    /* cache unavailable */
  }

  const cachedKeySet: Set<string> = db
    ? await loadCachedEmbeddingKeys(db)
    : new Set();
  const cacheHits = keys.filter((k) => cachedKeySet.has(k)).length;
  console.log(
    `[GPD] embedding cache: ${cacheHits}/${subset.length} hits, skipping thumbnails`,
  );

  logger?.updateInfo({ candidates: subset.length, cacheHits });

  // Wrap onProgress to feed stability tracking alongside the UI callback.
  const stabilityTracker = new StabilityTracker((est) =>
    logger?.recordStableEstimate(est),
  );
  const trackedProgress: ProgressCallback = (progress) => {
    onProgress?.(progress);
    stabilityTracker.update(progress.phase, progress.current, progress.total);
  };

  const t1 = performance.now();
  const blobs = await fetchThumbnails(subset, cachedKeySet, trackedProgress, signal);
  const fetchThumbnailsMs = Math.round(performance.now() - t1);
  console.log(
    `[GPD] fetchThumbnails: ${subset.length - cacheHits} items in ${fetchThumbnailsMs}ms`,
  );
  await logger?.phaseComplete("fetchThumbnailsMs", fetchThumbnailsMs);

  signal?.throwIfAborted();

  const t2 = performance.now();
  const { embeddings, validIndices } = await computeEmbeddings(
    blobs,
    keys,
    db,
    cachedKeySet,
    trackedProgress,
    signal,
  );
  const computeEmbeddingsMs = Math.round(performance.now() - t2);
  console.log(
    `[GPD] computeEmbeddings: ${embeddings.length} items (${cacheHits} cached) in ${computeEmbeddingsMs}ms`,
  );
  await logger?.phaseComplete("computeEmbeddingsMs", computeEmbeddingsMs);

  if (embeddings.length < 2) return [];

  // Build bucket index arrays (indices into embeddings[])
  const mediaKeyToEmbIdx = new Map<string, number>();
  for (let i = 0; i < validIndices.length; i++)
    mediaKeyToEmbIdx.set(subset[validIndices[i]].mediaKey, i);

  const workerBuckets = buckets
    .map((bucket) =>
      bucket
        .map((item) => mediaKeyToEmbIdx.get(item.mediaKey))
        .filter((i): i is number => i !== undefined),
    )
    .filter((b) => b.length >= 2);

  if (workerBuckets.length === 0) return [];

  // Offload pairwise comparison to worker
  trackedProgress({ phase: "detecting_duplicates", current: 0, total: 0 });
  await new Promise<void>((r) => setTimeout(r, 0)); // flush React phase update
  const workerUrl = chrome.runtime.getURL("scripts/embedder-worker.js");
  const t3 = performance.now();
  const indexGroups = await runSmartDetectionInWorker(
    embeddings,
    threshold,
    workerBuckets,
    workerUrl,
    trackedProgress,
    signal,
  );
  const communityDetectionMs = Math.round(performance.now() - t3);
  const totalMs = Math.round(performance.now() - scanStart);
  console.log(
    `[GPD] communityDetection: ${indexGroups.length} groups in ${communityDetectionMs}ms`,
  );
  console.log(`[GPD] scan complete: ${totalMs}ms total`);
  await logger?.phaseComplete("communityDetectionMs", communityDetectionMs);

  // Map indices back to GpdMediaItems
  const groups: DuplicateGroup[] = indexGroups.map((indices, i) => {
    const items = indices
      .map((idx) => subset[validIndices[idx]])
      .sort((a, b) => (a.creationTimestamp ?? 0) - (b.creationTimestamp ?? 0));
    return {
      id: `group-${i}`,
      mediaKeys: items.map((x) => x.mediaKey),
      originalMediaKey: selectDefaultKeep(items),
      similarity: threshold,
    };
  });

  return groups.sort((a, b) => b.mediaKeys.length - a.mediaKeys.length);
}

// ============================================================
// Step 1: Fetch thumbnails
// ============================================================

async function fetchThumbnails(
  items: GpdMediaItem[],
  cachedKeySet: Set<string>,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<(Blob | null)[]> {
  const concurrency = 10;
  const fetchTimeoutMs = 8000;
  const blobs: (Blob | null)[] = new Array(items.length).fill(null);
  let completed = 0;

  // Only enqueue items that don't have a cached embedding
  const queue = items
    .map((item, i) => ({ item, index: i }))
    .filter(({ item }) => !cachedKeySet.has(item.mediaKey));

  // Report progress only against items that actually need downloading.
  // Counting cached items as "pre-completed" caused the bar to start at e.g. 80%
  // and never visibly move before the phase transitioned.
  const total = queue.length;

  const reportProgress = () => {
    if (total === 0) return;
    if (completed % 50 === 0 || completed === total) {
      onProgress?.({
        phase: "downloading_thumbnails",
        current: completed,
        total,
      });
    }
  };

  const worker = async () => {
    while (queue.length > 0) {
      signal?.throwIfAborted();
      const entry = queue.shift();
      if (!entry) break;

      try {
        const url = entry.item.thumb + `=h${THUMB_HEIGHT}`;
        const response = await fetch(url, {
          credentials: "include",
          signal: (AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal }).any([
            AbortSignal.timeout(fetchTimeoutMs),
            ...(signal ? [signal] : []),
          ]),
        });
        if (response.ok) {
          blobs[entry.index] = await response.blob();
        } else {
          response.body?.cancel();
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        // Skip other failed downloads (timeouts, network errors, rate limits)
      }

      completed++;
      reportProgress();
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return blobs;
}

// ============================================================
// Step 2: Compute embeddings via MediaPipe worker pool
// ============================================================

const WORKER_BATCH_SIZE = 20;

async function computeEmbeddings(
  blobs: (Blob | null)[],
  keys: string[],
  db: IDBDatabase | null,
  cachedKeySet: Set<string>,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ embeddings: Float32Array[]; validIndices: number[] }> {
  // Stage B: bulk-load embedding values for cached items in two IDB calls.
  const keyToIndex = new Map(keys.map((k, i) => [k, i]));
  const cachedEmbeddings: Map<number, Float32Array> =
    db && cachedKeySet.size > 0
      ? await loadAllCachedEmbeddings(db, keyToIndex)
      : new Map();

  // Collect items that actually need computation
  const toCompute: Array<{ idx: number; blob: Blob }> = [];
  for (let i = 0; i < blobs.length; i++) {
    if (!cachedEmbeddings.has(i) && blobs[i]) {
      toCompute.push({ idx: i, blob: blobs[i]! });
    }
  }

  // Run worker pool for items needing computation
  const newEmbeddings = new Map<number, Float32Array>();
  if (toCompute.length > 0) {
    signal?.throwIfAborted();

    // Fetch model once on main thread; workers receive clones
    let modelBuffer: ArrayBuffer;
    try {
      const resp = await fetch(MODEL_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      modelBuffer = await resp.arrayBuffer();
    } catch (e) {
      throw new Error(
        `Failed to download model: ${e instanceof Error ? e.message : e}`,
      );
    }

    const wasmLoaderUrl = chrome.runtime.getURL(
      "scripts/vision_wasm_internal.js",
    );
    const wasmBinaryUrl = chrome.runtime.getURL(
      "scripts/vision_wasm_internal.wasm",
    );
    const workerUrl = chrome.runtime.getURL("scripts/embedder-worker.js");
    const numWorkers = Math.max(
      1,
      Math.min(navigator.hardwareConcurrency ?? 4, 8),
    );

    console.log(
      `[GPD] embedding: ${toCompute.length} items, ${numWorkers} workers`,
    );

    // Create and init all workers in parallel
    const workers = Array.from(
      { length: numWorkers },
      () => new Worker(workerUrl),
    );

    await Promise.all(
      workers.map(
        (w, i) =>
          new Promise<void>((resolve, reject) => {
            w.onmessage = (e) => {
              if (e.data.type === "ready") resolve();
              else if (e.data.type === "initError")
                reject(new Error(e.data.message));
            };
            w.onerror = (e) => reject(new Error(e.message));
            w.postMessage(
              {
                type: "init",
                data: {
                  wasmLoaderUrl,
                  wasmBinaryUrl,
                  modelBuffer: modelBuffer.slice(0),
                },
              },
              [modelBuffer.slice(0)], // transfer a clone; main thread keeps original for next worker
            );
          }),
      ),
    ).catch((e) => {
      workers.forEach((w) => w.terminate());
      throw new Error(`Worker init failed: ${e.message}`);
    });

    // Work queue: pull-based dispatch so fast workers take more items
    let queuePos = 0;
    let completedItems = 0;
    let pendingWorkers = numWorkers;

    await new Promise<void>((resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => {
          workers.forEach((w) => w.terminate());
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );

      const dispatch = (w: Worker) => {
        const start = queuePos;
        if (start >= toCompute.length) {
          if (--pendingWorkers === 0) resolve();
          return;
        }
        queuePos = Math.min(start + WORKER_BATCH_SIZE, toCompute.length);
        const batch = toCompute.slice(start, queuePos).map((item, j) => ({
          localIdx: start + j,
          blob: item.blob,
        }));
        w.postMessage({ type: "embed", data: { items: batch } });
      };

      workers.forEach((w) => {
        w.onmessage = (e) => {
          if (e.data.type !== "results") return;
          for (const { localIdx, embedding } of e.data.results as Array<{
            localIdx: number;
            embedding: ArrayBuffer;
          }>) {
            const idx = toCompute[localIdx].idx;
            const emb = new Float32Array(embedding);
            newEmbeddings.set(idx, emb);
            // Write to cache immediately — don't wait for all workers to finish.
            // If the scan is cancelled or the tab is closed mid-run, embeddings
            // computed so far are preserved and won't need recomputing next time.
            if (db) setCachedEmbedding(db, keys[idx], emb);
          }
          completedItems += e.data.results.length;
          onProgress?.({
            phase: "computing_embeddings",
            current: cachedEmbeddings.size + completedItems,
            total: blobs.length,
          });
          dispatch(w);
        };
        w.onerror = () => dispatch(w); // skip failed worker batches
        dispatch(w);
      });
    });

    workers.forEach((w) => w.terminate());
  }

  // Final progress update if everything was cached (no workers ran)
  if (toCompute.length === 0) {
    onProgress?.({
      phase: "computing_embeddings",
      current: blobs.length,
      total: blobs.length,
    });
  }

  // Assemble result in original order
  const embeddings: Float32Array[] = [];
  const validIndices: number[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const emb = cachedEmbeddings.get(i) ?? newEmbeddings.get(i);
    if (emb) {
      embeddings.push(emb);
      validIndices.push(i);
    }
  }

  return { embeddings, validIndices };
}

// ============================================================
// Step 3: Community detection — worker wrapper
// ============================================================

/**
 * Runs communityDetection in a dedicated worker so the main thread stays
 * responsive during the computation.
 *
 * Embeddings are packed into a single transferable Float32Array and sent
 * to the worker. The worker returns number[][] (the group index lists).
 */
async function runCommunityDetectionInWorker(
  embeddings: Float32Array[],
  threshold: number,
  timestamps: number[],
  workerUrl: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<number[][]> {
  const n = embeddings.length;
  if (n === 0) return [];
  const dim = embeddings[0].length;

  // Pack all embedding rows into one flat buffer for zero-copy transfer
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);

  const worker = new Worker(workerUrl);

  return new Promise<number[][]>((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (e) => {
      if (e.data.type === "detectionProgress") {
        onProgress?.({
          phase: "detecting_duplicates",
          current: e.data.current,
          total: e.data.total,
        });
      } else if (e.data.type === "detectionResults") {
        signal?.removeEventListener("abort", onAbort);
        worker.terminate();
        resolve(e.data.groups as number[][]);
      }
    };
    worker.onerror = (e) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(new Error(e.message ?? "Worker error during community detection"));
    };

    worker.postMessage(
      {
        type: "detect",
        data: { flatEmbeddings: flat, n, dim, threshold, timestamps },
      },
      [flat.buffer],
    );
  });
}

// ============================================================
// Community detection
// Sorts by timestamp, then walks through comparing each photo
// to the next. Consecutive similar photos are grouped together.
// O(n) instead of O(n²).
// ============================================================

/**
 * Find groups of similar embeddings by sorting on timestamp and
 * comparing each photo to the next one in the sorted list.
 * Returns groups of original indices.
 *
 * Exported for unit testing.
 */
export function communityDetection(
  embeddings: Float32Array[],
  threshold: number,
  timestamps?: number[],
): number[][] {
  const n = embeddings.length;
  if (n < 2) return [];
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
  }

  if (currentGroup.length >= 2) groups.push(currentGroup);

  groups.sort((a, b) => b.length - a.length);
  return groups;
}

// ============================================================
// Linear algebra helpers (typed arrays, no external deps)
// ============================================================

/**
 * Matrix multiplication: A[startA:endA] x B[startB:endB]^T
 * A and B are arrays of Float32Array (rows).
 * Returns a flat Float32Array of shape [endA-startA, endB-startB].
 *
 * Exported for unit testing.
 */
export function matMul(
  A: Float32Array[],
  startA: number,
  endA: number,
  B: Float32Array[],
  startB: number,
  endB: number,
  dim: number,
): Float32Array {
  const rowsA = endA - startA;
  const rowsB = endB - startB;
  const result = new Float32Array(rowsA * rowsB);

  for (let i = 0; i < rowsA; i++) {
    const aRow = A[startA + i];
    for (let j = 0; j < rowsB; j++) {
      const bRow = B[startB + j];
      let dot = 0;
      for (let k = 0; k < dim; k++) {
        dot += aRow[k] * bRow[k];
      }
      result[i * rowsB + j] = dot;
    }
  }

  return result;
}

/**
 * Find top-k largest values and their indices in a Float32Array.
 * Uses min-heap for small k (O(n log k)) and quickselect for large k (O(n) average).
 *
 * Exported for unit testing.
 */
export function topK(
  arr: Float32Array,
  k: number,
): { values: number[]; indices: number[] } {
  const n = arr.length;
  k = Math.min(k, n);
  if (k <= 0) return { values: [], indices: [] };

  // For small k, use min-heap — O(n log k) with low constant factor, no object allocation
  if (k <= 50) {
    const hVals = new Float32Array(k);
    const hIdxs = new Uint32Array(k);
    let size = 0;

    const siftDown = (pos: number) => {
      while (true) {
        let smallest = pos;
        const l = 2 * pos + 1;
        const r = l + 1;
        if (l < size && hVals[l] < hVals[smallest]) smallest = l;
        if (r < size && hVals[r] < hVals[smallest]) smallest = r;
        if (smallest === pos) break;
        let tmp = hVals[pos];
        hVals[pos] = hVals[smallest];
        hVals[smallest] = tmp;
        let ti = hIdxs[pos];
        hIdxs[pos] = hIdxs[smallest];
        hIdxs[smallest] = ti;
        pos = smallest;
      }
    };

    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (size < k) {
        hVals[size] = v;
        hIdxs[size] = i;
        size++;
        for (let p = (size >> 1) - 1; p >= 0; p--) siftDown(p);
      } else if (v > hVals[0]) {
        hVals[0] = v;
        hIdxs[0] = i;
        siftDown(0);
      }
    }

    // Pop from heap into descending order
    const values: number[] = new Array(size);
    const indices: number[] = new Array(size);
    for (let i = size - 1; i >= 0; i--) {
      values[i] = hVals[0];
      indices[i] = hIdxs[0];
      hVals[0] = hVals[--size];
      hIdxs[0] = hIdxs[size];
      siftDown(0);
    }
    return { values, indices };
  }

  // For larger k, use quickselect — O(n) average
  const vals = new Float32Array(n);
  const idxs = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    vals[i] = arr[i];
    idxs[i] = i;
  }

  let lo = 0,
    hi = n - 1;
  while (lo < hi) {
    const pivot = vals[hi];
    let p = lo;
    for (let i = lo; i < hi; i++) {
      if (vals[i] >= pivot) {
        let tv = vals[p];
        vals[p] = vals[i];
        vals[i] = tv;
        let ti = idxs[p];
        idxs[p] = idxs[i];
        idxs[i] = ti;
        p++;
      }
    }
    let tv = vals[p];
    vals[p] = vals[hi];
    vals[hi] = tv;
    let ti = idxs[p];
    idxs[p] = idxs[hi];
    idxs[hi] = ti;
    if (p === k - 1) break;
    if (p < k - 1) lo = p + 1;
    else hi = p - 1;
  }

  // Insertion sort the top-k partition for descending order
  for (let i = 1; i < k; i++) {
    const v = vals[i];
    const ix = idxs[i];
    let j = i - 1;
    while (j >= 0 && vals[j] < v) {
      vals[j + 1] = vals[j];
      idxs[j + 1] = idxs[j];
      j--;
    }
    vals[j + 1] = v;
    idxs[j + 1] = ix;
  }

  const values: number[] = new Array(k);
  const indices: number[] = new Array(k);
  for (let i = 0; i < k; i++) {
    values[i] = vals[i];
    indices[i] = idxs[i];
  }
  return { values, indices };
}
