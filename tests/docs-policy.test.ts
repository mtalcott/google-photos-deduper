import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const rootDir = path.resolve(__dirname, "..")

const readDoc = (relativePath: string) =>
  readFileSync(path.join(rootDir, relativePath), "utf8")

const compact = (value: string) => value.replace(/\s+/g, " ").toLowerCase()

describe("launch policy docs", () => {
  it("keeps durable launch docs aligned with implemented pricing and provider scope", () => {
    const marketing = compact(readDoc("docs/MARKETING.md"))
    const research = compact(readDoc("docs/MONETIZATION_RESEARCH.md"))
    const combined = `${marketing} ${research}`

    for (const expected of [
      "$2.99",
      "$4.99",
      "$14.99",
      "mini cleanup",
      "cleanup pass",
      "lifetime early access",
      "google photos, icloud photos, and amazon photos"
    ]) {
      expect(combined).toContain(expected)
    }

    expect(combined).not.toContain("paid promise is \"finish safely at scale\"")
    expect(combined).not.toContain("$9 cleanup pass")
    expect(combined).not.toContain("$29 lifetime pro")
    expect(combined).not.toContain("icloud/amazon providers | no or preview | yes")
  })

  it("documents privacy-safe license data boundaries", () => {
    const privacy = readDoc("docs/PRIVACY_POLICY.md")

    const text = compact(privacy)

    expect(text).toContain("does not upload photo content")
    expect(text).toContain("does not sell user data")
    expect(text).toContain("checkout opens externally through stripe")
    expect(text).toContain("pawsitivegames@gmail.com")
    expect(text).not.toContain("support@example.com")
    expect(text).not.toContain("launch draft")

    for (const forbiddenField of [
      "photo URLs",
      "thumbnails",
      "filenames",
      "album names",
      "raw reports",
      "exact timestamps",
      "people/location labels",
      "page content"
    ]) {
      expect(text).toContain(forbiddenField.toLowerCase())
    }
  })

  it("documents launch refund handling and provider parity", () => {
    const refund = readDoc("docs/REFUND_POLICY.md")

    const text = compact(refund)

    expect(text).toContain("within 7 days")
    expect(text).toContain("google photos")
    expect(text).toContain("icloud photos")
    expect(text).toContain("amazon photos")
    expect(text).toContain("same free and paid feature limits")
    expect(text).toContain("deactivate the matching license entitlement")
    expect(text).toContain("pawsitivegames@gmail.com")
    expect(text).not.toContain("support@example.com")
    expect(text).not.toContain("launch draft")

    for (const forbiddenSupportField of [
      "photo URLs",
      "thumbnails",
      "filenames",
      "album names",
      "raw reports",
      "exact timestamps",
      "people/location labels",
      "page content"
    ]) {
      expect(text).toContain(forbiddenSupportField.toLowerCase())
    }
  })

  it("publishes support instructions without requesting photo-derived data", () => {
    const support = compact(readDoc("docs/SUPPORT.md"))

    expect(support).toContain("pawsitivegames@gmail.com")
    expect(support).toContain("github issue tracker")
    expect(support).toContain("do not send photo urls")
    expect(support).toContain("optional paid-user diagnostics export")
    expect(support).not.toContain("support@example.com")
  })

  it("documents the paid launch release gate", () => {
    const checklist = compact(readDoc("docs/LAUNCH_CHECKLIST.md"))

    expect(checklist).toContain("stripe setup")
    expect(checklist).toContain("license api deployment")
    expect(checklist).toContain("extension production build")
    expect(checklist).toContain("live google photos validation")
    expect(checklist).toContain("google photos, icloud photos, and amazon photos")
    expect(checklist).toContain("plasmo_public_photosweep_allow_dev_entitlement=0")
    expect(checklist).toContain("pawsitivegames@gmail.com")
  })

  it("keeps live validation aligned with the paid multi-provider launch", () => {
    const validation = compact(readDoc("VALIDATION.md"))

    expect(validation).toContain("photosweep")
    expect(validation).toContain("paid multi-provider claims")
    expect(validation).toContain("paid launch validation")
    expect(validation).toContain("trash moves are capped cumulatively")
    expect(validation).toContain("refund the test payment")
    expect(validation).toContain("same free and paid feature limits")
  })
})
