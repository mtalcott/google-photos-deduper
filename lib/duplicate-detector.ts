import {
  fullDetectDuplicates,
  smartDetectDuplicates,
  type DetectionProgress
} from "./duplicate-detection-engine"
import type { ScanLogger } from "./scan-log"
import type { DuplicateGroup, GpdMediaItem, ScanMode } from "./types"

export { FULL_SCAN_BLOCK_SIZE } from "./duplicate-detection-engine"
export type {
  DetectionProgress,
  ScanTiming
} from "./duplicate-detection-engine"

export interface DuplicateDetectionRequest {
  mode: ScanMode
  mediaItems: GpdMediaItem[]
  threshold: number
  smartWindowMs?: number
  onProgress?: (progress: DetectionProgress) => void
  signal?: AbortSignal
  logger?: ScanLogger
  onPartialGroups?: (groups: DuplicateGroup[]) => void
}

export class DuplicateDetectionEngine {
  async detect(request: DuplicateDetectionRequest): Promise<DuplicateGroup[]> {
    if (request.mode === "smart") {
      return smartDetectDuplicates(
        request.mediaItems,
        request.threshold,
        request.smartWindowMs,
        request.onProgress,
        request.signal,
        request.logger,
        request.onPartialGroups
      )
    }

    const result = await fullDetectDuplicates(
      request.mediaItems,
      request.threshold,
      request.onProgress,
      request.signal,
      request.logger,
      request.onPartialGroups
    )
    return result.groups
  }
}
