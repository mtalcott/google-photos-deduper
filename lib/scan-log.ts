// Scan performance and error log — persisted incrementally to chrome.storage.local.
//
// chrome.storage.local is backed by LevelDB on disk and survives page reloads,
// extension reloads, and browser restarts. The active scan is written after each
// phase so that page reloads are captured even if the scan never completes.
//
// Reading logs from the extension console:
//   chrome.storage.local.get("scanLogs", console.log)
//
// Exporting to a file (run in the extension console):
//   chrome.storage.local.get("scanLogs", ({ scanLogs }) => {
//     const a = document.createElement("a")
//     a.href = URL.createObjectURL(new Blob([JSON.stringify(scanLogs, null, 2)], { type: "application/json" }))
//     a.download = "gpd-scan-logs.json"
//     a.click()
//   })

export interface StableEstimate {
  /** Phase name (matches DetectionProgress.phase). */
  phase: string
  /** Estimated total duration for this phase in ms. */
  estimatedMs: number
  /** Progress % through the phase when stability was first reached. */
  atPercent: number
}

export interface PhaseTimings {
  fetchThumbnailsMs?: number
  computeEmbeddingsMs?: number
  communityDetectionMs?: number
}

export type ScanStatus = "complete" | "cancelled" | "error" | "killed_by_reload"

export interface ScanLogEntry {
  timestamp: number
  status: ScanStatus
  totalItems: number
  /** Photos-only candidates (videos excluded). */
  candidates: number
  /** Candidates whose embedding was already in the IndexedDB cache. */
  cacheHits: number
  phaseTimings: PhaseTimings
  /** Wall-clock ms from scan start to termination (success or otherwise). */
  totalMs: number
  groupsFound?: number
  error?: string
  stableEstimates: StableEstimate[]
}

// ============================================================
// Storage keys
// ============================================================

const ACTIVE_KEY = "scanLogActive"
const LOG_KEY = "scanLogs"
const MAX_ENTRIES = 50

interface ActiveScanEntry {
  startedAt: number
  totalItems: number
  candidates: number
  cacheHits: number
  phaseTimings: PhaseTimings
  stableEstimates: StableEstimate[]
}

// ============================================================
// ScanLogger
// ============================================================

/**
 * Incrementally persists scan progress to chrome.storage.local.
 *
 * Lifecycle:
 *   scanLogger.recoverStale()        // on app mount — salvage any reload victim
 *   await scanLogger.start(n)        // before detectDuplicates
 *   // (detectDuplicates calls updateInfo / phaseComplete / recordStableEstimate)
 *   await scanLogger.finalize(...)   // on every exit path
 */
export class ScanLogger {
  private active: ActiveScanEntry | null = null

  /**
   * Call on app mount. If there is an active entry, the page reloaded during a
   * scan — commit it as "killed_by_reload" so the partial data is not lost.
   */
  async recoverStale(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(ACTIVE_KEY)
      const stale = stored[ACTIVE_KEY] as ActiveScanEntry | undefined
      if (!stale) return
      console.log(
        "[GPD] scan-log: stale active entry found — page reloaded during scan"
      )
      await this._commit({
        timestamp: Date.now(),
        status: "killed_by_reload",
        totalItems: stale.totalItems,
        candidates: stale.candidates,
        cacheHits: stale.cacheHits,
        phaseTimings: stale.phaseTimings,
        totalMs: Date.now() - stale.startedAt,
        stableEstimates: stale.stableEstimates
      })
    } catch {
      /* non-critical */
    }
  }

  /** Start a new active entry. Call before detectDuplicates. */
  async start(totalItems: number): Promise<void> {
    this.active = {
      startedAt: Date.now(),
      totalItems,
      candidates: 0,
      cacheHits: 0,
      phaseTimings: {},
      stableEstimates: []
    }
    await chrome.storage.local
      .set({ [ACTIVE_KEY]: this.active })
      .catch(() => {})
  }

  /**
   * Update candidates/cacheHits once detectDuplicates has computed them
   * (early in the scan, before thumbnail fetching). Fire-and-forget persist.
   */
  updateInfo(info: { candidates: number; cacheHits: number }): void {
    if (!this.active) return
    this.active.candidates = info.candidates
    this.active.cacheHits = info.cacheHits
    chrome.storage.local.set({ [ACTIVE_KEY]: this.active }).catch(() => {})
  }

  /** Called after each phase completes. Persists so page reloads capture partial data. */
  async phaseComplete(phase: keyof PhaseTimings, ms: number): Promise<void> {
    if (!this.active) return
    this.active.phaseTimings[phase] = ms
    await chrome.storage.local
      .set({ [ACTIVE_KEY]: this.active })
      .catch(() => {})
  }

  /** Called by StabilityTracker when a stable estimate is reached for a phase. */
  recordStableEstimate(est: StableEstimate): void {
    if (!this.active) return
    this.active.stableEstimates.push(est)
    chrome.storage.local.set({ [ACTIVE_KEY]: this.active }).catch(() => {})
  }

  /** Finalize the scan with a terminal status. Must be called on every exit path. */
  async finalize(
    status: ScanStatus,
    extra: { groupsFound?: number; error?: string } = {}
  ): Promise<void> {
    if (!this.active) return
    const active = this.active
    this.active = null
    await this._commit({
      timestamp: Date.now(),
      status,
      totalItems: active.totalItems,
      candidates: active.candidates,
      cacheHits: active.cacheHits,
      phaseTimings: active.phaseTimings,
      totalMs: Date.now() - active.startedAt,
      stableEstimates: active.stableEstimates,
      ...extra
    })
  }

  private async _commit(entry: ScanLogEntry): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(LOG_KEY)
      const logs: ScanLogEntry[] = stored[LOG_KEY] ?? []
      logs.push(entry)
      if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES)
      await chrome.storage.local.set({ [LOG_KEY]: logs })
      await chrome.storage.local.remove(ACTIVE_KEY)
    } catch {
      /* non-critical */
    }
  }
}

// ============================================================
// StabilityTracker
// ============================================================

/**
 * Wraps onProgress events and fires onStable once three consecutive
 * projected-total-duration estimates for a phase are within `tolerance`
 * of each other (default 5%). Requires ≥ `minProgress` completion (default 10%)
 * before the window starts, to avoid noise from early samples.
 *
 * Usage inside detectDuplicates:
 *   const tracker = new StabilityTracker((est) => logger?.recordStableEstimate(est))
 *   // then in the wrapped onProgress:
 *   tracker.update(progress.phase, progress.current, progress.total)
 */
export class StabilityTracker {
  private readonly window: number[] = []
  private phaseStart = 0
  private lastPhase = ""
  private readonly firedPhases = new Set<string>()

  constructor(
    private readonly onStable: (est: StableEstimate) => void,
    private readonly windowSize = 3,
    private readonly tolerance = 0.05,
    private readonly minProgress = 0.1
  ) {}

  update(phase: string, completed: number, total: number): void {
    if (total <= 0 || completed <= 0 || this.firedPhases.has(phase)) return

    // Reset window on phase transition
    if (phase !== this.lastPhase) {
      this.lastPhase = phase
      this.phaseStart = performance.now()
      this.window.length = 0
    }

    const progress = completed / total
    if (progress < this.minProgress) return

    const elapsedMs = performance.now() - this.phaseStart
    this.window.push(elapsedMs / progress)
    if (this.window.length > this.windowSize) this.window.shift()
    if (this.window.length < this.windowSize) return

    const min = Math.min(...this.window)
    const max = Math.max(...this.window)
    if (max / min > 1 + this.tolerance) return

    this.firedPhases.add(phase)
    const sorted = [...this.window].sort((a, b) => a - b)
    const median = sorted[Math.floor(this.windowSize / 2)]
    const est: StableEstimate = {
      phase,
      estimatedMs: Math.round(median),
      atPercent: Math.round(progress * 100)
    }
    console.log(
      `[GPD] stable estimate: ${phase} ~${Math.round(median)}ms (at ${Math.round(progress * 100)}%)`
    )
    this.onStable(est)
  }
}

// ============================================================
// Query
// ============================================================

/** Retrieve all stored log entries (oldest first). */
export async function getScanLogs(): Promise<ScanLogEntry[]> {
  try {
    const stored = await chrome.storage.local.get(LOG_KEY)
    return stored[LOG_KEY] ?? []
  } catch {
    return []
  }
}
