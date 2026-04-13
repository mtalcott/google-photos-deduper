# Embedding Cache

## Background

A full scan of a ~50k-item Google Photos library was instrumented to measure where time is spent. The results drove a decision to cache embeddings in IndexedDB.

## Measured Performance (50,534-item library)

| Step | Time | Notes |
|------|------|-------|
| Fetch media items (API) | ~3 min | Unchanged |
| Download thumbnails (h=200, cold) | **12.3 min** | 739s, concurrency=20 |
| Download thumbnails (HTTP-cached) | **~4 min** | Browser cache helps on re-scans |
| Model download (10.4MB) | **0.2s** | CDN-cached, low priority |
| Compute embeddings (MediaPipe) | **~60 min** | Serial, ~10 items/sec |
| Community detection | <1s | In-memory matrix ops |

**Total cold scan: ~75 min. Dominated by serial embedding computation.**

### Storage sizes

| What | Size |
|------|------|
| Thumbnails (h=200, 48k photos) | ~819MB total, 17.2KB avg |
| Embeddings (1280-dim float32) | **5.0KB/item → ~238MB for 48k items** |
| MediaPipe model | 10.4MB |

## Why Cache Embeddings (Not Thumbnails or the Model)

**Thumbnails (~819MB):** Too large to store in IndexedDB. Google's CDN already caches them at the HTTP layer, so repeat downloads are ~4 min instead of 12 min anyway. Not worth it.

**Model (10.4MB):** Already downloads in ~0.2s from CDN. Low priority — the scan would need to be run offline for this to matter.

**Embeddings (~238MB):** This is the bottleneck. Serial MediaPipe inference at ~10 items/sec means ~60 min per scan for a 48k-photo library. Embeddings are deterministic — the same image always produces the same 1280-dim float32 vector. Caching them in IndexedDB eliminates both the thumbnail download step and the embedding computation step on all subsequent scans.

## Implementation

Two files changed:

**`lib/embedding-cache.ts`** — IndexedDB wrapper around a single object store (`embeddings`, keyPath: `mediaKey`). Methods: `open()`, `getMany()`, `setMany()`, `evictExcept()`.

**`lib/duplicate-detector.ts`** — `detectDuplicates` now:
1. Opens the cache and batch-fetches embeddings for all candidates
2. Skips thumbnail download for items with cache hits
3. Only runs MediaPipe inference on cache misses
4. Persists newly computed embeddings back to cache
5. Evicts stale entries (deleted photos) at end of scan

Cache key: `mediaKey` (stable — Google Photos doesn't edit originals in-place).

## Expected Scan Times After First Run

| Scenario | Time |
|----------|------|
| First scan (cold cache) | ~75 min (unchanged) |
| Re-scan, same library | ~1 min (media fetch only) |
| Re-scan, N new photos | ~1 min + N × 0.1s |
| Extension reinstall / cache cleared | ~75 min (full recompute) |
