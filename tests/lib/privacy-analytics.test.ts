import { describe, expect, it } from "vitest"

import {
  buildAnalyticsEvent,
  countBucket,
  sendPrivacySafeAnalyticsEvent
} from "../../lib/privacy-analytics"
import { buildSupportDiagnosticsReport } from "../../lib/support-diagnostics"

describe("privacy analytics", () => {
  it("uses buckets instead of exact counts", () => {
    expect(countBucket(12)).toBe("0-99")
    expect(countBucket(1200)).toBe("1k-5k")
    expect(countBucket(50000)).toBe("50k+")
  })

  it("drops unknown fields from event payloads", () => {
    const event = buildAnalyticsEvent({
      name: "scan_completed",
      provider: "google",
      photoCountBucket: "1k-5k",
      // Simulates an accidental caller-side leak; buildAnalyticsEvent must not
      // copy fields outside the allowlist.
      photoUrl: "https://photos.example/private"
    } as Parameters<typeof buildAnalyticsEvent>[0] & { photoUrl: string })

    expect(event).toEqual({
      name: "scan_completed",
      provider: "google",
      photoCountBucket: "1k-5k",
      scanMode: undefined,
      planId: undefined,
      duplicateGroupCountBucket: undefined,
      errorCategory: undefined
    })
    expect(event).not.toHaveProperty("photoUrl")
  })

  it("sends only sanitized analytics event payloads", async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const sent = await sendPrivacySafeAnalyticsEvent(
      "https://license.example",
      {
        name: "trash_completed",
        provider: "google",
        photoCountBucket: "0-99",
        photoUrl: "https://photos.example/private"
      } as Parameters<typeof sendPrivacySafeAnalyticsEvent>[1] & {
        photoUrl: string
      },
      (async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body))
        })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as typeof fetch
    )

    expect(sent).toBe(true)
    expect(calls).toEqual([
      {
        url: "https://license.example/analytics",
        body: {
          name: "trash_completed",
          provider: "google",
          photoCountBucket: "0-99"
        }
      }
    ])
    expect(JSON.stringify(calls)).not.toContain("photos.example")
  })
})

describe("support diagnostics", () => {
  it("redacts urls and emails from recent logs", () => {
    const report = buildSupportDiagnosticsReport({
      version: "2.2.2",
      provider: "google",
      scanMode: "smart",
      entitlement: { planId: "free", active: true, source: "none" },
      recentLogs: [
        "failed for alice@example.com at https://photos.google.com/photo/abc"
      ]
    })

    expect(report.recentLogs[0]).toBe("failed for [email] at [url]")
    expect(JSON.stringify(report)).not.toContain("alice@example.com")
    expect(JSON.stringify(report)).not.toContain("photos.google.com/photo/abc")
  })

  it("redacts obvious photo-derived values from recent logs", () => {
    const report = buildSupportDiagnosticsReport({
      version: "2.2.2",
      provider: "google",
      scanMode: "smart",
      entitlement: { planId: "free", active: true, source: "none" },
      recentLogs: [
        "failed IMG_1234.HEIC taken 2026-01-02T03:04:05.000Z id AF1QipPrivateKey"
      ]
    })

    expect(report.recentLogs[0]).toBe(
      "failed [filename] taken [date] id [provider-id]"
    )
    expect(JSON.stringify(report)).not.toContain("IMG_1234.HEIC")
    expect(JSON.stringify(report)).not.toContain("2026-01-02T03:04:05.000Z")
    expect(JSON.stringify(report)).not.toContain("AF1QipPrivateKey")
  })

  it("reports the paid plan before the signed entitlement expires", () => {
    const report = buildSupportDiagnosticsReport({
      version: "2.2.2",
      provider: "google",
      scanMode: "smart",
      entitlement: {
        planId: "cleanup_pass",
        active: true,
        source: "signed_token",
        expiresAt: Date.now() + 60_000
      }
    })

    expect(report.planId).toBe("cleanup_pass")
  })

  it("reports free immediately after a signed entitlement expires", () => {
    const report = buildSupportDiagnosticsReport({
      version: "2.2.2",
      provider: "google",
      scanMode: "smart",
      entitlement: {
        planId: "cleanup_pass",
        active: true,
        source: "signed_token",
        expiresAt: Date.now() - 1000
      }
    })

    expect(report.planId).toBe("free")
  })
})
