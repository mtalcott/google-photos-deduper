/**
 * Unit tests for lib/embedding-cache.ts — EmbeddingCache (IndexedDB wrapper).
 *
 * Uses fake-indexeddb (in-memory IDB) for isolation.
 * Each test gets a fresh IDBFactory instance so state never leaks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { EmbeddingCache } from "../../lib/embedding-cache"

// ============================================================
// Test isolation: fresh IDB store per test
// ============================================================

beforeEach(() => {
  // Replace the global indexedDB with a fresh in-memory factory.
  // EmbeddingCache.open() uses indexedDB as a global, so this
  // ensures each test starts with an empty database.
  globalThis.indexedDB = new IDBFactory()
})

// ============================================================
// Helpers
// ============================================================

function makeEmbedding(seed: number, length = 8): Float32Array {
  return new Float32Array(Array.from({ length }, (_, i) => seed + i * 0.1))
}

// ============================================================
// Tests
// ============================================================

describe("EmbeddingCache", () => {
  describe("getMany + setMany round-trip", () => {
    it("returns stored embeddings by mediaKey", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([
        { mediaKey: "key1", embedding: makeEmbedding(1) },
        { mediaKey: "key2", embedding: makeEmbedding(2) },
      ])

      const results = await cache.getMany(["key1", "key2"])
      expect(results).toHaveLength(2)
      expect(results[0]).toBeInstanceOf(Float32Array)
      expect(Array.from(results[0]!)).toEqual(Array.from(makeEmbedding(1)))
      expect(Array.from(results[1]!)).toEqual(Array.from(makeEmbedding(2)))
      cache.close()
    })

    it("returns null for cache misses", async () => {
      const cache = await EmbeddingCache.open()
      const results = await cache.getMany(["missing-key"])
      expect(results[0]).toBeNull()
      cache.close()
    })

    it("returns mixed hits and misses in correct order", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([{ mediaKey: "present", embedding: makeEmbedding(5) }])

      const results = await cache.getMany(["present", "absent", "present"])
      expect(results[0]).not.toBeNull()
      expect(results[1]).toBeNull()
      expect(results[2]).not.toBeNull()
      cache.close()
    })

    it("returns empty array for empty input", async () => {
      const cache = await EmbeddingCache.open()
      const results = await cache.getMany([])
      expect(results).toEqual([])
      cache.close()
    })

    it("overwrites an existing entry on setMany", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([{ mediaKey: "key1", embedding: makeEmbedding(1) }])
      await cache.setMany([{ mediaKey: "key1", embedding: makeEmbedding(99) }])

      const results = await cache.getMany(["key1"])
      expect(Array.from(results[0]!)).toEqual(Array.from(makeEmbedding(99)))
      cache.close()
    })
  })

  describe("count", () => {
    it("returns 0 for an empty cache", async () => {
      const cache = await EmbeddingCache.open()
      expect(await cache.count()).toBe(0)
      cache.close()
    })

    it("returns the number of stored entries", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([
        { mediaKey: "k1", embedding: makeEmbedding(1) },
        { mediaKey: "k2", embedding: makeEmbedding(2) },
        { mediaKey: "k3", embedding: makeEmbedding(3) },
      ])
      expect(await cache.count()).toBe(3)
      cache.close()
    })
  })

  describe("evictExcept", () => {
    it("deletes keys not in the keep set and returns eviction count", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([
        { mediaKey: "keep-me", embedding: makeEmbedding(1) },
        { mediaKey: "evict-me", embedding: makeEmbedding(2) },
        { mediaKey: "also-evict", embedding: makeEmbedding(3) },
      ])

      const evicted = await cache.evictExcept(new Set(["keep-me"]))
      expect(evicted).toBe(2)

      const remaining = await cache.getMany(["keep-me", "evict-me", "also-evict"])
      expect(remaining[0]).not.toBeNull()
      expect(remaining[1]).toBeNull()
      expect(remaining[2]).toBeNull()
      cache.close()
    })

    it("evicts nothing when all keys are in keep set", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([
        { mediaKey: "a", embedding: makeEmbedding(1) },
        { mediaKey: "b", embedding: makeEmbedding(2) },
      ])

      const evicted = await cache.evictExcept(new Set(["a", "b"]))
      expect(evicted).toBe(0)
      expect(await cache.count()).toBe(2)
      cache.close()
    })

    it("evicts all keys when keep set is empty", async () => {
      const cache = await EmbeddingCache.open()
      await cache.setMany([
        { mediaKey: "x", embedding: makeEmbedding(1) },
        { mediaKey: "y", embedding: makeEmbedding(2) },
      ])

      const evicted = await cache.evictExcept(new Set())
      expect(evicted).toBe(2)
      expect(await cache.count()).toBe(0)
      cache.close()
    })
  })
})
