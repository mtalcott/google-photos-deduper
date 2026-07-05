import type { ScanCheckpoint } from "./scan-checkpoint"
import type { DuplicateGroup, GpdMediaItem, PhotoProvider, ScanMode, ScanSettings } from "./types"

export type PlanId = "free" | "mini_cleanup" | "cleanup_pass" | "lifetime"

export type EntitlementSource = "none" | "local_dev" | "signed_token"

export interface Entitlement {
  planId: PlanId
  active: boolean
  expiresAt?: number
  issuedAt?: number
  source: EntitlementSource
}

export type PlanLimitValue = number | "unlimited"

export interface PlanLimits {
  maxPhotosPerScan: PlanLimitValue
  maxVisibleGroups: PlanLimitValue
  maxTrashMovesPerSession: PlanLimitValue
  fullReports: boolean
  fullScanMode: boolean
  largeLibraryResume: boolean
  paidProviders: PhotoProvider[]
}

export interface ScanGate {
  allowed: boolean
  reason?: "full_scan_locked" | "unscoped_scan_locked" | "scan_size_locked"
  limit?: PlanLimitValue
  estimatedCount?: number
}

export const FREE_ENTITLEMENT: Entitlement = {
  planId: "free",
  active: true,
  source: "none"
}

// Time-limited signed entitlements fail closed once their signed expiry is
// reached. The extension refreshes server-backed passes before paid actions so
// server time, not the user's local clock, is authoritative for Cleanup Pass.
export const OFFLINE_GRACE_MS = 0

const SUPPORTED_PHOTO_PROVIDERS: PhotoProvider[] = [
  "google",
  "icloud",
  "amazon"
]

const allSupportedPhotoProviders = (): PhotoProvider[] => [
  ...SUPPORTED_PHOTO_PROVIDERS
]

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxPhotosPerScan: 1000,
    maxVisibleGroups: 25,
    maxTrashMovesPerSession: 10,
    fullReports: false,
    fullScanMode: false,
    largeLibraryResume: false,
    paidProviders: allSupportedPhotoProviders()
  },
  mini_cleanup: {
    maxPhotosPerScan: 2500,
    maxVisibleGroups: 75,
    maxTrashMovesPerSession: 100,
    fullReports: true,
    fullScanMode: false,
    largeLibraryResume: false,
    paidProviders: allSupportedPhotoProviders()
  },
  cleanup_pass: {
    maxPhotosPerScan: 10000,
    maxVisibleGroups: "unlimited",
    maxTrashMovesPerSession: "unlimited",
    fullReports: true,
    fullScanMode: true,
    largeLibraryResume: true,
    paidProviders: allSupportedPhotoProviders()
  },
  lifetime: {
    maxPhotosPerScan: "unlimited",
    maxVisibleGroups: "unlimited",
    maxTrashMovesPerSession: "unlimited",
    fullReports: true,
    fullScanMode: true,
    largeLibraryResume: true,
    paidProviders: allSupportedPhotoProviders()
  }
}

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  mini_cleanup: "Mini Cleanup",
  cleanup_pass: "Cleanup Pass",
  lifetime: "Lifetime Early Access"
}

export const PLAN_PRICES: Partial<Record<PlanId, string>> = {
  mini_cleanup: "$2.99",
  cleanup_pass: "$4.99",
  lifetime: "$14.99"
}

export function isPlanId(value: unknown): value is PlanId {
  return (
    value === "free" ||
    value === "mini_cleanup" ||
    value === "cleanup_pass" ||
    value === "lifetime"
  )
}

export function isEntitlementActive(
  entitlement: Entitlement | null | undefined,
  now = Date.now()
): entitlement is Entitlement {
  if (!entitlement?.active) return false
  if (!isPlanId(entitlement.planId)) return false
  if (!entitlement.expiresAt || entitlement.expiresAt > now) return true
  return false
}

export function getEffectivePlanId(
  entitlement: Entitlement | null | undefined,
  now = Date.now()
): PlanId {
  return isEntitlementActive(entitlement, now) ? entitlement.planId : "free"
}

export function getPlanLimits(
  entitlement: Entitlement | null | undefined,
  now = Date.now()
): PlanLimits {
  return PLAN_LIMITS[getEffectivePlanId(entitlement, now)]
}

export function isFreeIcloudPlan(
  settings: ScanSettings,
  entitlement: Entitlement | null | undefined
): boolean {
  return (
    (settings.sourceProvider ?? "google") === "icloud" &&
    getEffectivePlanId(entitlement) === "free"
  )
}

export function scanSettingsForEntitlement(
  settings: ScanSettings,
  entitlement: Entitlement | null | undefined
): ScanSettings {
  return isFreeIcloudPlan(settings, entitlement)
    ? { ...settings, icloudBatchLimit: undefined }
    : settings
}

export function canUseScanMode(
  scanMode: ScanMode,
  entitlement: Entitlement | null | undefined
): boolean {
  return scanMode !== "full" || getPlanLimits(entitlement).fullScanMode
}

export function canUsePaidProvider(
  provider: PhotoProvider,
  entitlement: Entitlement | null | undefined
): boolean {
  return getPlanLimits(entitlement).paidProviders.includes(provider)
}

export function getEstimatedScanCount(
  settings: ScanSettings,
  fallbackEstimate?: number
): number | undefined {
  const provider = settings.sourceProvider ?? "google"
  const batchLimit =
    provider === "amazon"
      ? settings.amazonBatchLimit
      : provider === "icloud"
        ? settings.icloudBatchLimit
        : undefined
  if (typeof batchLimit === "number" && Number.isFinite(batchLimit)) {
    return Math.max(1, Math.floor(batchLimit))
  }
  if (settings.albumScope?.itemCount !== undefined) {
    return settings.albumScope.itemCount
  }
  return fallbackEstimate
}

function hasScopedScan(settings: ScanSettings): boolean {
  return Boolean(
    settings.albumScope ||
      settings.dateRange?.from ||
      settings.dateRange?.to ||
      getEstimatedScanCount(settings) !== undefined
  )
}

function isWithinLimit(count: number, limit: PlanLimitValue): boolean {
  return limit === "unlimited" || count <= limit
}

export function getScanGate(
  settings: ScanSettings,
  estimatedCount: number | undefined,
  entitlement: Entitlement | null | undefined
): ScanGate {
  const limits = getPlanLimits(entitlement)
  if (!canUseScanMode(settings.scanMode, entitlement)) {
    return {
      allowed: false,
      reason: "full_scan_locked",
      limit: limits.maxPhotosPerScan,
      estimatedCount
    }
  }
  if (
    limits.maxPhotosPerScan !== "unlimited" &&
    estimatedCount === undefined &&
    !hasScopedScan(settings)
  ) {
    return {
      allowed: false,
      reason: "unscoped_scan_locked",
      limit: limits.maxPhotosPerScan
    }
  }
  if (
    estimatedCount !== undefined &&
    !isWithinLimit(estimatedCount, limits.maxPhotosPerScan)
  ) {
    return {
      allowed: false,
      reason: "scan_size_locked",
      limit: limits.maxPhotosPerScan,
      estimatedCount
    }
  }
  return { allowed: true, limit: limits.maxPhotosPerScan, estimatedCount }
}

export function canStartScan(
  settings: ScanSettings,
  estimatedCount: number | undefined,
  entitlement: Entitlement | null | undefined
): boolean {
  return getScanGate(settings, estimatedCount, entitlement).allowed
}

export function limitScanItems(
  items: GpdMediaItem[],
  entitlement: Entitlement | null | undefined
): { items: GpdMediaItem[]; lockedItemCount: number } {
  const limit = getPlanLimits(entitlement).maxPhotosPerScan
  if (limit === "unlimited" || items.length <= limit) {
    return { items, lockedItemCount: 0 }
  }
  return {
    items: items.slice(0, limit),
    lockedItemCount: items.length - limit
  }
}

export function getVisibleGroups(
  groups: DuplicateGroup[],
  entitlement: Entitlement | null | undefined
): DuplicateGroup[] {
  const limit = getPlanLimits(entitlement).maxVisibleGroups
  return limit === "unlimited" ? groups : groups.slice(0, limit)
}

export function getLockedGroupCount(
  groups: DuplicateGroup[],
  entitlement: Entitlement | null | undefined
): number {
  return Math.max(0, groups.length - getVisibleGroups(groups, entitlement).length)
}

export function canTrashCount(
  count: number,
  entitlement: Entitlement | null | undefined,
  alreadyMovedThisSession = 0
): boolean {
  return isWithinLimit(
    Math.max(0, alreadyMovedThisSession) + Math.max(0, count),
    getPlanLimits(entitlement).maxTrashMovesPerSession
  )
}

export function canExportFullReport(
  entitlement: Entitlement | null | undefined
): boolean {
  return getPlanLimits(entitlement).fullReports
}

export function canResumeCheckpoint(
  checkpoint: ScanCheckpoint,
  entitlement: Entitlement | null | undefined
): boolean {
  const limits = getPlanLimits(entitlement)
  const settings = scanSettingsForEntitlement(checkpoint.settings, entitlement)
  if (isFreeIcloudPlan(checkpoint.settings, entitlement) && !hasScopedScan(settings)) {
    return false
  }
  const estimate =
    checkpoint.totalEstimate ||
    checkpoint.mediaItems?.length ||
    getEstimatedScanCount(settings)
  if (
    !limits.largeLibraryResume &&
    estimate !== undefined &&
    !isWithinLimit(estimate, limits.maxPhotosPerScan)
  ) {
    return false
  }
  return canStartScan(settings, estimate, entitlement)
}
