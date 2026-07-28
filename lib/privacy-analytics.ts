import type { Entitlement } from "./entitlement"
import type { PhotoProvider, ScanMode } from "./types"

export const ANALYTICS_CONSENT_STORAGE_KEY = "photoSweepAnalyticsConsent"

export type AnalyticsEventName =
  | "app_opened"
  | "scan_started"
  | "scan_completed"
  | "upgrade_prompt_shown"
  | "checkout_started"
  | "restore_requested"
  | "restore_completed"
  | "restore_not_found"
  | "entitlement_refreshed"
  | "export_clicked"
  | "trash_attempted"
  | "trash_completed"
  | "error"

export interface PrivacySafeAnalyticsEvent {
  name: AnalyticsEventName
  provider?: PhotoProvider
  scanMode?: ScanMode
  planId?: Entitlement["planId"]
  photoCountBucket?: string
  duplicateGroupCountBucket?: string
  errorCategory?: string
}

export function countBucket(count: number): string {
  if (count < 100) return "0-99"
  if (count < 1000) return "100-999"
  if (count < 5000) return "1k-5k"
  if (count < 10000) return "5k-10k"
  if (count < 50000) return "10k-50k"
  return "50k+"
}

export function buildAnalyticsEvent(
  event: PrivacySafeAnalyticsEvent
): PrivacySafeAnalyticsEvent {
  return {
    name: event.name,
    provider: event.provider,
    scanMode: event.scanMode,
    planId: event.planId,
    photoCountBucket: event.photoCountBucket,
    duplicateGroupCountBucket: event.duplicateGroupCountBucket,
    errorCategory: event.errorCategory
  }
}

export async function sendPrivacySafeAnalyticsEvent(
  apiBaseUrl: string | undefined,
  event: PrivacySafeAnalyticsEvent,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!apiBaseUrl) return false
  const response = await fetchImpl(`${apiBaseUrl}/analytics`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAnalyticsEvent(event))
  })
  return response.ok
}
