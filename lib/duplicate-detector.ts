// Duplicate image detection using MediaPipe Image Embedder.
// Ports the Python DuplicateImageDetector to run in the browser.
//
// Pipeline:
// 1. Fetch thumbnails for media items
// 2. Compute L2-normalized embeddings via MediaPipe MobileNet V3
// 3. Group duplicates using fast community detection (cosine similarity)

import { ImageEmbedder } from "@mediapipe/tasks-vision"
import type { GpdMediaItem, DuplicateGroup } from "./types"

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_large/float32/latest/mobilenet_v3_large.tflite"

// Thumbnail height for embedding computation. Larger = more accurate but slower.
const THUMB_HEIGHT = 200

export interface DetectionProgress {
  phase: "downloading_thumbnails" | "computing_embeddings" | "grouping"
  current: number
  total: number
}

type ProgressCallback = (progress: DetectionProgress) => void

// ============================================================
// Main entry point
// ============================================================

export async function detectDuplicates(
  mediaItems: GpdMediaItem[],
  threshold: number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<DuplicateGroup[]> {
  // Filter to items with thumbnails (photos only, skip videos)
  const candidates = mediaItems.filter((item) => item.thumb && !item.duration)
  console.log(`[GPD] detectDuplicates: ${mediaItems.length} items → ${candidates.length} candidates`)
  if (candidates.length < 2) return []

  // Step 1: Download thumbnails
  const blobs = await fetchThumbnails(candidates, onProgress, signal)

  signal?.throwIfAborted()

  // Step 2: Compute embeddings
  const { embeddings, validIndices } = await computeEmbeddings(
    blobs,
    onProgress,
    signal
  )
  if (embeddings.length < 2) return []

  // Step 3: Community detection
  onProgress?.({
    phase: "grouping",
    current: 0,
    total: embeddings.length,
  })
  const indexGroups = communityDetection(embeddings, threshold)

  // Map indices back to media items and build DuplicateGroup objects
  const groups: DuplicateGroup[] = indexGroups.map((indices, i) => {
    const mediaKeys = indices.map((idx) => candidates[validIndices[idx]].mediaKey)
    return {
      id: `group-${i}`,
      mediaKeys,
      originalMediaKey: mediaKeys[0], // First item (central point) as default original
      similarity: threshold, // Approximate; all items are at least this similar
    }
  })

  return groups
}

// ============================================================
// Step 1: Fetch thumbnails
// ============================================================

async function fetchThumbnails(
  items: GpdMediaItem[],
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<(Blob | null)[]> {
  const concurrency = 20
  const blobs: (Blob | null)[] = new Array(items.length).fill(null)
  let completed = 0

  const queue = items.map((item, i) => ({ item, index: i }))

  const worker = async () => {
    while (queue.length > 0) {
      signal?.throwIfAborted()
      const entry = queue.shift()
      if (!entry) break

      try {
        const url = entry.item.thumb + `=h${THUMB_HEIGHT}`
        const response = await fetch(url, {
          credentials: "include",
          signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
        })
        if (response.ok) {
          blobs[entry.index] = await response.blob()
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e
        // Skip other failed downloads
      }

      completed++
      if (completed % 50 === 0 || completed === items.length) {
        onProgress?.({
          phase: "downloading_thumbnails",
          current: completed,
          total: items.length,
        })
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  return blobs
}

// ============================================================
// Step 2: Compute embeddings via MediaPipe
// ============================================================

async function computeEmbeddings(
  blobs: (Blob | null)[],
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ embeddings: Float32Array[]; validIndices: number[] }> {
  // MediaPipe's createFromOptions internally injects a <script crossOrigin="anonymous">
  // tag to load the WASM loader JS, which is blocked by extension CSP (script-src 'self').
  // Workaround: pre-load the JS ourselves from bundled assets (same-origin = CSP-safe),
  // then pass wasmLoaderPath: "" so MediaPipe skips its dynamic injection.
  const jsUrl = chrome.runtime.getURL("scripts/vision_wasm_internal.js")
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = jsUrl
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load MediaPipe WASM loader script"))
    document.head.appendChild(script)
  })

  const vision = {
    // wasmLoaderPath: "" is an undocumented internal hook — MediaPipe skips
    // dynamic script injection when this is empty. If MediaPipe changes this
    // behavior in a future version, check WasmFileset handling in tasks-vision.
    wasmLoaderPath: "",
    wasmBinaryPath: chrome.runtime.getURL("scripts/vision_wasm_internal.wasm"),
  }

  // Fetch model as ArrayBuffer — modelAssetPath fails in extension context
  let modelBuffer: ArrayBuffer
  try {
    const resp = await fetch(MODEL_URL)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    modelBuffer = await resp.arrayBuffer()
  } catch (e) {
    throw new Error(`Failed to download model: ${e instanceof Error ? e.message : e}`)
  }

  let embedder
  try {
    embedder = await ImageEmbedder.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer) },
      quantize: false,
      l2Normalize: true,
      runningMode: "IMAGE",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : e instanceof Event ? `Event(${(e as ErrorEvent).message || e.type})`
      : String(e)
    throw new Error(`Failed to create ImageEmbedder: ${msg}`)
  }

  const embeddings: Float32Array[] = []
  const validIndices: number[] = []

  for (let i = 0; i < blobs.length; i++) {
    signal?.throwIfAborted()
    const blob = blobs[i]
    if (!blob) continue

    try {
      // Create an ImageBitmap from the blob
      const bitmap = await createImageBitmap(blob)

      // Create an offscreen canvas to render the image
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

      // MediaPipe expects an HTMLCanvasElement or ImageData
      // Using the canvas approach for browser compatibility
      const result = embedder.embed(imageData)
      if (result?.embeddings?.[0]?.floatEmbedding) {
        embeddings.push(new Float32Array(result.embeddings[0].floatEmbedding))
        validIndices.push(i)
      }

      bitmap.close()
    } catch {
      // Skip invalid images
    }

    if ((i + 1) % 20 === 0 || i === blobs.length - 1) {
      onProgress?.({
        phase: "computing_embeddings",
        current: i + 1,
        total: blobs.length,
      })
    }
  }

  embedder.close()
  return { embeddings, validIndices }
}

// ============================================================
// Step 3: Community detection
// Ported from sentence-transformers/util.py community_detection()
// ============================================================

/**
 * Find communities of similar embeddings using cosine similarity.
 * Returns groups of indices (into the embeddings array) where all
 * pairwise similarities exceed the threshold.
 *
 * Exported for unit testing.
 */
export function communityDetection(
  embeddings: Float32Array[],
  threshold: number,
  minCommunitySize = 2,
  batchSize = 128
): number[][] {
  const n = embeddings.length
  const dim = embeddings[0].length
  const extractedCommunities: number[][] = []
  let sortMaxSize = Math.min(Math.max(2 * minCommunitySize, 50), n)

  for (let startIdx = 0; startIdx < n; startIdx += batchSize) {
    const endIdx = Math.min(startIdx + batchSize, n)
    const batchLen = endIdx - startIdx

    // Compute cosine similarity: batch x all embeddings
    // Embeddings are L2-normalized so cos_sim = dot product
    const cosScores = matMul(embeddings, startIdx, endIdx, embeddings, 0, n, dim)

    for (let i = 0; i < batchLen; i++) {
      // Get the row of similarity scores
      const row = cosScores.subarray(i * n, (i + 1) * n)

      // Find top-k values to check if there are at least minCommunitySize items above threshold
      const topKMin = topK(row, minCommunitySize)
      if (topKMin.values[topKMin.values.length - 1] < threshold) continue

      // Find all items above threshold
      let topKResult = topK(row, sortMaxSize)

      // Expand if needed
      while (
        topKResult.values[topKResult.values.length - 1] > threshold &&
        sortMaxSize < n
      ) {
        sortMaxSize = Math.min(2 * sortMaxSize, n)
        topKResult = topK(row, sortMaxSize)
      }

      const cluster: number[] = []
      for (let j = 0; j < topKResult.values.length; j++) {
        if (topKResult.values[j] < threshold) break
        cluster.push(topKResult.indices[j])
      }

      if (cluster.length >= minCommunitySize) {
        extractedCommunities.push(cluster)
      }
    }
  }

  // Sort by size (largest first)
  extractedCommunities.sort((a, b) => b.length - a.length)

  // Remove overlapping communities
  const uniqueCommunities: number[][] = []
  const assignedIds = new Set<number>()

  for (const community of extractedCommunities) {
    const nonOverlapping = community
      .sort((a, b) => a - b)
      .filter((idx) => !assignedIds.has(idx))

    if (nonOverlapping.length >= minCommunitySize) {
      uniqueCommunities.push(nonOverlapping)
      for (const idx of nonOverlapping) assignedIds.add(idx)
    }
  }

  // Sort by size (largest first)
  uniqueCommunities.sort((a, b) => b.length - a.length)
  return uniqueCommunities
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
  dim: number
): Float32Array {
  const rowsA = endA - startA
  const rowsB = endB - startB
  const result = new Float32Array(rowsA * rowsB)

  for (let i = 0; i < rowsA; i++) {
    const aRow = A[startA + i]
    for (let j = 0; j < rowsB; j++) {
      const bRow = B[startB + j]
      let dot = 0
      for (let k = 0; k < dim; k++) {
        dot += aRow[k] * bRow[k]
      }
      result[i * rowsB + j] = dot
    }
  }

  return result
}

/**
 * Find top-k largest values and their indices in a Float32Array.
 *
 * Exported for unit testing.
 */
export function topK(
  arr: Float32Array,
  k: number
): { values: number[]; indices: number[] } {
  k = Math.min(k, arr.length)

  // Create index array and partial sort
  const indexed: Array<{ val: number; idx: number }> = []
  for (let i = 0; i < arr.length; i++) {
    indexed.push({ val: arr[i], idx: i })
  }

  // Partial sort: only need top k
  indexed.sort((a, b) => b.val - a.val)

  const values: number[] = []
  const indices: number[] = []
  for (let i = 0; i < k; i++) {
    values.push(indexed[i].val)
    indices.push(indexed[i].idx)
  }

  return { values, indices }
}
