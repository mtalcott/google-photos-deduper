import { describe, expect, it, vi } from "vitest"

import type { Entitlement } from "../../lib/entitlement"
import {
  PaidAccessLifecycle,
  PaidAccessNotConfiguredError,
  type PaidAccessAdapter,
  type PaidAccessClient
} from "../../lib/paid-access-lifecycle"

function entitlement(
  planId: Entitlement["planId"],
  source: Entitlement["source"] = "signed_token"
): Entitlement {
  return { planId, active: true, source }
}

function fixture(options?: {
  initialPlan?: Entitlement["planId"]
  refreshedPlan?: Entitlement["planId"]
  token?: string
  configured?: boolean
}) {
  const fetchEntitlementToken = vi.fn(async () => "fresh-token")
  const createCheckout = vi.fn(async () => ({ url: "https://checkout.test" }))
  const recoverLicense = vi.fn(async () => {})
  const client: PaidAccessClient = {
    isConfigured: () => options?.configured !== false,
    fetchEntitlementToken,
    createCheckout,
    recoverLicense
  }
  const saveVerifiedToken = vi.fn(async (token: string) => ({
    entitlement: entitlement(options?.refreshedPlan ?? "lifetime"),
    token,
    refreshedAt: 2
  }))
  const adapter: PaidAccessAdapter = {
    async load() {
      return {
        stored: {
          entitlement: entitlement(options?.initialPlan ?? "free"),
          token: options?.token,
          refreshedAt: 1
        },
        apiBaseUrl:
          options?.configured === false ? undefined : "https://license.test"
      }
    },
    saveVerifiedToken,
    createClient: () => client
  }
  return {
    lifecycle: new PaidAccessLifecycle(adapter),
    fetchEntitlementToken,
    createCheckout,
    recoverLicense,
    saveVerifiedToken
  }
}

describe("PaidAccessLifecycle", () => {
  it("loads verified access and refreshes a stored token once", async () => {
    const subject = fixture({ token: "stored-token" })
    const loaded = await subject.lifecycle.initialize()

    expect(loaded.storedTokenPresent).toBe(true)
    expect(
      (await subject.lifecycle.refreshStoredTokenOnce())?.stored.entitlement
    ).toMatchObject({ planId: "lifetime" })
    expect(await subject.lifecycle.refreshStoredTokenOnce()).toBeNull()
    expect(subject.fetchEntitlementToken).toHaveBeenCalledTimes(1)
  })

  it("refreshes Cleanup Pass before authorizing an action", async () => {
    const subject = fixture({
      initialPlan: "cleanup_pass",
      refreshedPlan: "cleanup_pass"
    })
    await subject.lifecycle.initialize()

    const authorized = await subject.lifecycle.authorizeAction()

    expect(authorized.planId).toBe("cleanup_pass")
    expect(subject.fetchEntitlementToken).toHaveBeenCalledOnce()
  })

  it("does not refresh lifetime access before an action", async () => {
    const subject = fixture({ initialPlan: "lifetime" })
    await subject.lifecycle.initialize()

    expect((await subject.lifecycle.authorizeAction()).planId).toBe("lifetime")
    expect(subject.fetchEntitlementToken).not.toHaveBeenCalled()
  })

  it("owns checkout and recovery ordering", async () => {
    const subject = fixture({ refreshedPlan: "lifetime" })
    await subject.lifecycle.initialize()

    expect(await subject.lifecycle.createCheckout("lifetime")).toEqual({
      url: "https://checkout.test"
    })
    await subject.lifecycle.recover("buyer@example.com")
    const refreshed = await subject.lifecycle.refresh()

    expect(subject.createCheckout).toHaveBeenCalledWith("lifetime")
    expect(subject.recoverLicense).toHaveBeenCalledWith("buyer@example.com")
    expect(refreshed.recovery).toBe("completed")
  })

  it("fails closed when paid access is not configured", async () => {
    const subject = fixture({ configured: false })
    await subject.lifecycle.initialize()

    await expect(
      subject.lifecycle.createCheckout("cleanup_pass")
    ).rejects.toBeInstanceOf(PaidAccessNotConfiguredError)
    await expect(subject.lifecycle.refresh()).rejects.toBeInstanceOf(
      PaidAccessNotConfiguredError
    )
  })
})
