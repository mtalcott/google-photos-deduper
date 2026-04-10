// Embedding cache using IndexedDB.
// Stores Float32Array embeddings keyed by mediaKey, persisted across scans.
// Typical size: ~5KB/item × 48k items = ~238MB for a large library.

const DB_NAME = "gpd-cache"
const DB_VERSION = 1
const STORE_NAME = "embeddings"

interface EmbeddingRecord {
  mediaKey: string
  embedding: Float32Array
}

export class EmbeddingCache {
  private db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
  }

  static async open(): Promise<EmbeddingCache> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "mediaKey" })
        }
      }
      req.onsuccess = () => resolve(new EmbeddingCache(req.result))
      req.onerror = () => reject(req.error)
    })
  }

  /** Retrieve embeddings for a batch of mediaKeys. Returns null for cache misses. */
  async getMany(mediaKeys: string[]): Promise<(Float32Array | null)[]> {
    if (mediaKeys.length === 0) return []
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const results: (Float32Array | null)[] = new Array(mediaKeys.length).fill(null)
      let pending = mediaKeys.length

      mediaKeys.forEach((key, i) => {
        const req = store.get(key)
        req.onsuccess = () => {
          results[i] = (req.result as EmbeddingRecord | undefined)?.embedding ?? null
          if (--pending === 0) resolve(results)
        }
        req.onerror = () => {
          if (--pending === 0) resolve(results)
        }
      })
    })
  }

  /** Persist a batch of embeddings. Overwrites existing entries. */
  async setMany(records: { mediaKey: string; embedding: Float32Array }[]): Promise<void> {
    if (records.length === 0) return
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      for (const record of records) {
        store.put(record)
      }
    })
  }

  /** Delete stale entries no longer in the current library. */
  async evictExcept(keepKeys: Set<string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.openKeyCursor()
      const toDelete: string[] = []

      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          if (!keepKeys.has(cursor.key as string)) {
            toDelete.push(cursor.key as string)
          }
          cursor.continue()
        } else {
          for (const key of toDelete) store.delete(key)
        }
      }
      tx.oncomplete = () => resolve(toDelete.length)
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Return the total number of entries in the cache. */
  async count(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readonly")
      const req = tx.objectStore(STORE_NAME).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  close(): void {
    this.db.close()
  }
}
