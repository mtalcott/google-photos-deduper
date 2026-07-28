import {
  createScanCheckpoint,
  updateScanCheckpoint,
  type ScanCheckpoint
} from "./scan-checkpoint"
import type { ScanSettings } from "./types"

type ScanCheckpointPatch = Parameters<typeof updateScanCheckpoint>[1]

export interface ScanLifecycleAdapter {
  persist(checkpoint: ScanCheckpoint): Promise<void> | void
  clear(): Promise<void> | void
  now?(): number
  createAbortController?(): AbortController
}

export interface BeginScanParams {
  requestId: string
  settings: ScanSettings
  accountEmail?: string
}

export interface ResumeScanParams {
  requestId: string
  checkpoint: ScanCheckpoint
  patch: ScanCheckpointPatch
}

export class ScanLifecycle {
  private activeRequestId: string | null = null
  private activeCheckpoint: ScanCheckpoint | null = null
  private abortController: AbortController | null = null

  constructor(private readonly adapter: ScanLifecycleAdapter) {}

  get requestId(): string | null {
    return this.activeRequestId
  }

  get checkpoint(): ScanCheckpoint | null {
    return this.activeCheckpoint
  }

  get signal(): AbortSignal | null {
    return this.abortController?.signal ?? null
  }

  begin(params: BeginScanParams): {
    checkpoint: ScanCheckpoint
    signal: AbortSignal
  } {
    this.abortController?.abort()
    this.abortController = this.createAbortController()
    this.activeRequestId = params.requestId
    this.activeCheckpoint = createScanCheckpoint({
      id: params.requestId,
      settings: params.settings,
      accountEmail: params.accountEmail,
      now: this.now()
    })
    void this.adapter.persist(this.activeCheckpoint)
    return {
      checkpoint: this.activeCheckpoint,
      signal: this.abortController.signal
    }
  }

  resume(params: ResumeScanParams): {
    checkpoint: ScanCheckpoint
    signal: AbortSignal
  } {
    this.abortController?.abort()
    this.abortController = this.createAbortController()
    this.activeRequestId = params.requestId
    this.activeCheckpoint = updateScanCheckpoint(
      {
        ...params.checkpoint,
        id: params.requestId,
        status: "active"
      },
      params.patch,
      this.now()
    )
    void this.adapter.persist(this.activeCheckpoint)
    return {
      checkpoint: this.activeCheckpoint,
      signal: this.abortController.signal
    }
  }

  restore(
    checkpoint: ScanCheckpoint | null,
    interruptedMessage = "Previous scan was interrupted. Resume to reuse completed cached embeddings."
  ): ScanCheckpoint | null {
    this.abortController?.abort()
    this.abortController = null
    this.activeRequestId = null
    this.activeCheckpoint =
      checkpoint?.status === "active"
        ? updateScanCheckpoint(
            checkpoint,
            { status: "interrupted", message: interruptedMessage },
            this.now()
          )
        : checkpoint
    if (checkpoint?.status === "active" && this.activeCheckpoint) {
      void this.adapter.persist(this.activeCheckpoint)
    }
    return this.activeCheckpoint
  }

  isCurrent(requestId: string): boolean {
    return this.activeRequestId === requestId
  }

  patch(patch: ScanCheckpointPatch, requestId?: string): ScanCheckpoint | null {
    if (!this.activeCheckpoint) return null
    if (requestId && this.activeCheckpoint.id !== requestId) return null
    this.activeCheckpoint = updateScanCheckpoint(
      this.activeCheckpoint,
      patch,
      this.now()
    )
    void this.adapter.persist(this.activeCheckpoint)
    return this.activeCheckpoint
  }

  pause(requestId?: string): ScanCheckpoint | null {
    if (requestId && !this.isCurrent(requestId)) return null
    const paused =
      this.activeCheckpoint?.status === "active"
        ? this.patch(
            {
              status: "interrupted",
              message:
                "Scan paused. Resume to reuse completed cached embeddings."
            },
            requestId
          )
        : this.activeCheckpoint
    this.abortController?.abort()
    this.abortController = null
    this.activeRequestId = null
    return paused
  }

  fail(requestId: string, error: unknown): ScanCheckpoint | null {
    if (!this.isCurrent(requestId)) return null
    const message = String(error)
    const failed = this.patch(
      {
        status: "error",
        error: message,
        message: `Duplicate detection failed: ${message}`
      },
      requestId
    )
    this.abortController = null
    this.activeRequestId = null
    return failed
  }

  async complete(requestId: string): Promise<boolean> {
    if (!this.isCurrent(requestId)) return false
    this.abortController = null
    this.activeRequestId = null
    this.activeCheckpoint = null
    await this.adapter.clear()
    return true
  }

  reset(): void {
    this.abortController?.abort()
    this.abortController = null
    this.activeRequestId = null
    this.activeCheckpoint = null
    void this.adapter.clear()
  }

  private now(): number {
    return this.adapter.now?.() ?? Date.now()
  }

  private createAbortController(): AbortController {
    return this.adapter.createAbortController?.() ?? new AbortController()
  }
}
