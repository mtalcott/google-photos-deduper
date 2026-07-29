import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  importEntitlementPublicKey,
  verifySignedEntitlementToken
} from "../../lib/license-client"
import {
  createJsonFileLicenseStore,
  createLicenseApi,
  createMemoryLicenseStore
} from "../../server/license-api.mjs"

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url")
}

function testKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1"
  })
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url")
  }
}

function webhookSignature(
  body: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")
  return `t=${timestamp},v1=${signature}`
}

function envFor(privateKey: string): Record<string, string> {
  return {
    STRIPE_SECRET_KEY: "sk_test_photosweep",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    PHOTOSWEEP_ALLOWED_ORIGINS: "chrome-extension://abc",
    PHOTOSWEEP_ENTITLEMENT_PRIVATE_KEY: base64Url(privateKey),
    PHOTOSWEEP_STRIPE_PRICE_MINI_CLEANUP: "price_mini",
    PHOTOSWEEP_STRIPE_PRICE_CLEANUP_PASS_7D: "price_pass",
    PHOTOSWEEP_STRIPE_PRICE_LIFETIME_EARLY_ACCESS: "price_lifetime",
    PHOTOSWEEP_CHECKOUT_SUCCESS_URL: "https://photosweep.test/success",
    PHOTOSWEEP_CHECKOUT_CANCEL_URL: "https://photosweep.test/cancel",
    PHOTOSWEEP_RECOVERY_BASE_URL: "https://license.test",
    PHOTOSWEEP_RECOVERY_REDIRECT_URL: "https://photosweep.test/recovered"
  }
}

async function verifyToken(token: string, publicKeyValue: string) {
  const publicKey = await importEntitlementPublicKey(publicKeyValue)
  return verifySignedEntitlementToken(token, publicKey)
}

describe("license API", () => {
  it("creates checkout, activates entitlement from webhook, and signs extension-verifiable tokens", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const stripeCalls: Array<{ url: string; init: RequestInit }> = []
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store,
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        stripeCalls.push({ url: String(url), init: init ?? {} })
        return new Response(
          JSON.stringify({
            id: "cs_test_123",
            url: "https://checkout.stripe.test/cs_test_123"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }) as typeof fetch
    })

    const checkoutResponse = await api(
      new Request("https://license.test/checkout", {
        method: "POST",
        headers: {
          origin: "chrome-extension://abc",
          "content-type": "application/json"
        },
        body: JSON.stringify({ planId: "cleanup_pass" })
      })
    )

    expect(checkoutResponse.status).toBe(200)
    const stripeBody = stripeCalls[0].init.body as URLSearchParams
    const licenseSessionId = stripeBody.get("metadata[licenseSessionId]")
    expect(licenseSessionId).toBeTruthy()
    expect(stripeBody.get("line_items[0][price]")).toBe("price_pass")
    expect(stripeBody.get("metadata[planId]")).toBe("cleanup_pass")
    expect(stripeBody.get("metadata[licenseSessionId]")).toBe(licenseSessionId)
    expect(new Headers(stripeCalls[0].init.headers).get("stripe-version")).toBe(
      "2026-02-25.clover"
    )

    const webhookBody = JSON.stringify({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_test_123",
          payment_status: "paid",
          client_reference_id: licenseSessionId,
          metadata: {
            planId: "cleanup_pass",
            licenseSessionId
          },
          customer_details: { email: "buyer@example.com" }
        }
      }
    })
    const webhookResponse = await api(
      new Request("https://license.test/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": webhookSignature(
            webhookBody,
            env.STRIPE_WEBHOOK_SECRET
          )
        },
        body: webhookBody
      })
    )
    expect(webhookResponse.status).toBe(200)

    const entitlementResponse = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": licenseSessionId ?? "" }
      })
    )
    expect(entitlementResponse.status).toBe(200)
    const entitlement = (await entitlementResponse.json()) as { token: string }
    await expect(
      verifyToken(entitlement.token, keys.publicKey)
    ).resolves.toMatchObject({
      planId: "cleanup_pass",
      active: true,
      source: "signed_token"
    })
    expect(store.snapshot().analyticsEvents).toEqual([
      expect.objectContaining({
        name: "purchase_completed",
        planId: "cleanup_pass"
      })
    ])
  })

  it("waits for delayed payment success before activating access", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store
    })
    const licenseSessionId = "pls_delayed_payment"
    const checkoutSession = {
      id: "cs_delayed",
      customer: "cus_delayed",
      payment_intent: "pi_delayed",
      payment_status: "unpaid",
      client_reference_id: licenseSessionId,
      metadata: {
        planId: "lifetime",
        licenseSessionId
      }
    }
    const sendEvent = (id: string, type: string, object = checkoutSession) => {
      const body = JSON.stringify({ id, type, data: { object } })
      return api(
        new Request("https://license.test/stripe/webhook", {
          method: "POST",
          headers: {
            "stripe-signature": webhookSignature(
              body,
              env.STRIPE_WEBHOOK_SECRET
            )
          },
          body
        })
      )
    }

    expect(
      (await sendEvent("evt_delayed_completed", "checkout.session.completed"))
        .status
    ).toBe(200)
    expect(store.snapshot().licensesBySessionId).toEqual({})

    expect(
      (
        await sendEvent(
          "evt_delayed_paid",
          "checkout.session.async_payment_succeeded",
          {
            ...checkoutSession,
            payment_status: "paid"
          }
        )
      ).status
    ).toBe(200)
    expect(
      store.snapshot().licensesBySessionId[licenseSessionId]
    ).toMatchObject({
      planId: "lifetime",
      status: "active"
    })
    expect(store.snapshot().analyticsEvents).toEqual([
      expect.objectContaining({
        name: "purchase_completed",
        planId: "lifetime"
      })
    ])

    expect(
      (
        await sendEvent("evt_delayed_replay", "checkout.session.completed", {
          ...checkoutSession,
          payment_status: "paid"
        })
      ).status
    ).toBe(200)
    expect(store.snapshot().analyticsEvents).toHaveLength(1)
  })

  it("is idempotent and downgrades refunded customer licenses", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store,
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            id: "cs_test_456",
            url: "https://checkout.stripe.test/cs_test_456"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as typeof fetch
    })
    const checkout = await api(
      new Request("https://license.test/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "lifetime" })
      })
    )
    expect(checkout.status).toBe(200)
    const checkoutBody = await checkout.json()
    expect(checkoutBody).toMatchObject({
      url: "https://checkout.stripe.test/cs_test_456"
    })
    const snapshotBeforeWebhook = store.snapshot()
    expect(snapshotBeforeWebhook.licensesBySessionId).toEqual({})
    const licenseSessionId = "pls_refund_test"
    await store.upsertLicense({
      sessionId: licenseSessionId,
      planId: "lifetime",
      status: "active",
      stripeCustomerId: "cus_refund_456",
      stripeCheckoutSessionId: "cs_test_456",
      stripePaymentIntentId: "pi_refund_456",
      purchasedAt: Date.now()
    })
    const checkoutEvent = JSON.stringify({
      id: "evt_lifetime",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_456",
          customer: "cus_refund_456",
          payment_status: "paid",
          client_reference_id: licenseSessionId,
          metadata: { planId: "lifetime", licenseSessionId }
        }
      }
    })
    const eventRequest = () =>
      new Request("https://license.test/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": webhookSignature(
            checkoutEvent,
            env.STRIPE_WEBHOOK_SECRET
          )
        },
        body: checkoutEvent
      })

    expect((await api(eventRequest())).status).toBe(200)
    const duplicate = await api(eventRequest())
    await expect(duplicate.json()).resolves.toMatchObject({ duplicate: true })

    const refundEvent = JSON.stringify({
      id: "evt_refund",
      type: "charge.refunded",
      data: {
        object: {
          payment_intent: "pi_refund_456",
          amount: 1499,
          amount_refunded: 1499
        }
      }
    })
    expect(
      (
        await api(
          new Request("https://license.test/stripe/webhook", {
            method: "POST",
            headers: {
              "stripe-signature": webhookSignature(
                refundEvent,
                env.STRIPE_WEBHOOK_SECRET
              )
            },
            body: refundEvent
          })
        )
      ).status
    ).toBe(200)

    const entitlementResponse = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": licenseSessionId }
      })
    )
    expect(entitlementResponse.status).toBe(200)
    const entitlement = (await entitlementResponse.json()) as { token: string }
    await expect(
      verifyToken(entitlement.token, keys.publicKey)
    ).resolves.toMatchObject({
      planId: "free",
      active: true,
      source: "signed_token"
    })
  })

  it("keeps access after a partial refund and revokes it after a full refund", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const licenseSessionId = "pls_partial_refund"
    await store.upsertLicense({
      sessionId: licenseSessionId,
      planId: "lifetime",
      status: "active",
      stripePaymentIntentId: "pi_partial_refund",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store
    })
    const sendRefund = async (
      eventId: string,
      amountRefunded: number
    ): Promise<Response> => {
      const body = JSON.stringify({
        id: eventId,
        type: "charge.refunded",
        data: {
          object: {
            payment_intent: "pi_partial_refund",
            amount: 1499,
            amount_refunded: amountRefunded
          }
        }
      })
      return api(
        new Request("https://license.test/stripe/webhook", {
          method: "POST",
          headers: {
            "stripe-signature": webhookSignature(
              body,
              env.STRIPE_WEBHOOK_SECRET
            )
          },
          body
        })
      )
    }

    expect((await sendRefund("evt_partial_refund", 500)).status).toBe(200)
    expect(
      store.snapshot().licensesBySessionId[licenseSessionId]
    ).toMatchObject({
      status: "active"
    })
    expect(store.snapshot().analyticsEvents).toEqual([])

    expect((await sendRefund("evt_full_refund", 1499)).status).toBe(200)
    expect(
      store.snapshot().licensesBySessionId[licenseSessionId]
    ).toMatchObject({
      status: "inactive",
      inactiveReason: "charge.refunded"
    })
    expect(store.snapshot().analyticsEvents).toEqual([
      expect.objectContaining({
        name: "purchase_refunded",
        planId: "lifetime"
      })
    ])
  })

  it("bounds long-lived signed access so revocations can reconcile", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    await store.upsertLicense({
      sessionId: "pls_token_ttl",
      planId: "lifetime",
      status: "active",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store
    })
    const before = Date.now()
    const response = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": "pls_token_ttl" }
      })
    )
    const body = (await response.json()) as { token: string }
    const entitlement = await verifyToken(body.token, keys.publicKey)

    expect(entitlement).toMatchObject({
      planId: "lifetime",
      active: true,
      source: "signed_token"
    })
    expect(entitlement.expiresAt).toBeGreaterThan(
      before + 29 * 24 * 60 * 60 * 1000
    )
    expect(entitlement.expiresAt).toBeLessThanOrEqual(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    )
  })

  it("refunds by payment intent without deactivating another license for the same customer", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    await store.upsertLicense({
      sessionId: "pls_old_purchase",
      planId: "mini_cleanup",
      status: "active",
      stripeCustomerId: "cus_multi",
      stripeCheckoutSessionId: "cs_old",
      stripePaymentIntentId: "pi_old",
      purchasedAt: Date.now() - 1000
    })
    await store.upsertLicense({
      sessionId: "pls_current_purchase",
      planId: "lifetime",
      status: "active",
      stripeCustomerId: "cus_multi",
      stripeCheckoutSessionId: "cs_current",
      stripePaymentIntentId: "pi_current",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store
    })
    const refundEvent = JSON.stringify({
      id: "evt_refund_old_pi",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_multi",
          payment_intent: "pi_old"
        }
      }
    })

    expect(
      (
        await api(
          new Request("https://license.test/stripe/webhook", {
            method: "POST",
            headers: {
              "stripe-signature": webhookSignature(
                refundEvent,
                env.STRIPE_WEBHOOK_SECRET
              )
            },
            body: refundEvent
          })
        )
      ).status
    ).toBe(200)

    const currentEntitlement = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": "pls_current_purchase" }
      })
    )
    const current = (await currentEntitlement.json()) as { token: string }
    await expect(
      verifyToken(current.token, keys.publicKey)
    ).resolves.toMatchObject({
      planId: "lifetime",
      active: true,
      source: "signed_token"
    })
    const oldEntitlement = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": "pls_old_purchase" }
      })
    )
    const old = (await oldEntitlement.json()) as { token: string }
    await expect(verifyToken(old.token, keys.publicKey)).resolves.toMatchObject(
      {
        planId: "free",
        active: true,
        source: "signed_token"
      }
    )
  })

  it("keeps the highest valid purchase when another purchase is refunded", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const stripeCalls: Array<{ body: URLSearchParams }> = []
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store,
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body as URLSearchParams
        stripeCalls.push({ body })
        return new Response(
          JSON.stringify({
            id: `cs_multi_${stripeCalls.length}`,
            url: `https://checkout.stripe.test/cs_multi_${stripeCalls.length}`
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }) as typeof fetch
    })
    const sessionId = "pls_multi_purchase"

    for (const planId of ["lifetime", "cleanup_pass"]) {
      const response = await api(
        new Request("https://license.test/checkout", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-photosweep-license-session": sessionId
          },
          body: JSON.stringify({ planId })
        })
      )
      expect(response.status).toBe(200)
    }
    expect(stripeCalls).toHaveLength(2)
    expect(
      stripeCalls.map((call) => call.body.get("metadata[licenseSessionId]"))
    ).toEqual([sessionId, sessionId])

    const sendPaidCheckout = async (
      eventId: string,
      checkoutId: string,
      paymentIntentId: string,
      planId: "lifetime" | "cleanup_pass"
    ) => {
      const body = JSON.stringify({
        id: eventId,
        type: "checkout.session.completed",
        data: {
          object: {
            id: checkoutId,
            payment_intent: paymentIntentId,
            payment_status: "paid",
            client_reference_id: sessionId,
            metadata: { planId, licenseSessionId: sessionId }
          }
        }
      })
      return api(
        new Request("https://license.test/stripe/webhook", {
          method: "POST",
          headers: {
            "stripe-signature": webhookSignature(
              body,
              env.STRIPE_WEBHOOK_SECRET
            )
          },
          body
        })
      )
    }

    expect(
      (await sendPaidCheckout("evt_lifetime", "cs_multi_1", "pi_lifetime", "lifetime"))
        .status
    ).toBe(200)
    expect(
      (
        await sendPaidCheckout(
          "evt_cleanup_pass",
          "cs_multi_2",
          "pi_cleanup_pass",
          "cleanup_pass"
        )
      ).status
    ).toBe(200)

    const entitlementBeforeRefund = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": sessionId }
      })
    )
    await expect(
      verifyToken(
        (await entitlementBeforeRefund.json() as { token: string }).token,
        keys.publicKey
      )
    ).resolves.toMatchObject({ planId: "lifetime", active: true })

    const refundBody = JSON.stringify({
      id: "evt_lifetime_refund",
      type: "charge.refunded",
      data: {
        object: {
          payment_intent: "pi_lifetime",
          amount: 1499,
          amount_refunded: 1499
        }
      }
    })
    expect(
      (
        await api(
          new Request("https://license.test/stripe/webhook", {
            method: "POST",
            headers: {
              "stripe-signature": webhookSignature(
                refundBody,
                env.STRIPE_WEBHOOK_SECRET
              )
            },
            body: refundBody
          })
        )
      ).status
    ).toBe(200)

    const entitlementAfterRefund = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": sessionId }
      })
    )
    await expect(
      verifyToken(
        (await entitlementAfterRefund.json() as { token: string }).token,
        keys.publicKey
      )
    ).resolves.toMatchObject({ planId: "cleanup_pass", active: true })
  })

  it("does not deactivate a paid license from an older expired checkout", async () => {
    const keys = testKeys()
    const env = envFor(keys.privateKey)
    const store = createMemoryLicenseStore()
    const licenseSessionId = "pls_reused_session"
    await store.upsertLicense({
      sessionId: licenseSessionId,
      planId: "lifetime",
      status: "active",
      stripeCustomerId: "cus_current",
      stripeCheckoutSessionId: "cs_paid_new",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: env as unknown as NodeJS.ProcessEnv,
      store
    })
    const expiredOldCheckout = JSON.stringify({
      id: "evt_expired_old",
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_unpaid_old",
          client_reference_id: licenseSessionId,
          metadata: { licenseSessionId, planId: "lifetime" }
        }
      }
    })

    const webhookResponse = await api(
      new Request("https://license.test/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": webhookSignature(
            expiredOldCheckout,
            env.STRIPE_WEBHOOK_SECRET
          )
        },
        body: expiredOldCheckout
      })
    )
    expect(webhookResponse.status).toBe(200)

    const entitlementResponse = await api(
      new Request("https://license.test/entitlement", {
        headers: { "x-photosweep-license-session": licenseSessionId }
      })
    )
    const entitlement = (await entitlementResponse.json()) as { token: string }
    await expect(
      verifyToken(entitlement.token, keys.publicKey)
    ).resolves.toMatchObject({
      planId: "lifetime",
      active: true,
      source: "signed_token"
    })
  })

  it("rejects unsigned webhooks", async () => {
    const keys = testKeys()
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store: createMemoryLicenseStore()
    })
    const response = await api(
      new Request("https://license.test/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bad" },
        body: JSON.stringify({ id: "evt_bad" })
      })
    )
    expect(response.status).toBe(400)
  })

  it("does not rebind licenses from email-only recovery by default", async () => {
    const keys = testKeys()
    const store = createMemoryLicenseStore()
    await store.upsertLicense({
      sessionId: "pls_recover",
      planId: "lifetime",
      status: "active",
      email: "buyer@example.com",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store
    })

    const response = await api(
      new Request("https://license.test/license/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("sends a signed recovery link without revealing whether an email exists", async () => {
    const keys = testKeys()
    const store = createMemoryLicenseStore()
    const sent: Array<{ email: string; recoveryUrl: string }> = []
    await store.upsertLicense({
      sessionId: "pls_recover",
      planId: "lifetime",
      status: "active",
      email: "buyer@example.com",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store: {
        ...store,
        async sendRecoveryEmail(message: {
          email: string
          recoveryUrl: string
        }) {
          sent.push(message)
        }
      }
    })

    const response = await api(
      new Request("https://license.test/license/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    )
    const missingResponse = await api(
      new Request("https://license.test/license/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "missing@example.com" })
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(missingResponse.status).toBe(200)
    expect(await missingResponse.json()).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0].email).toBe("buyer@example.com")
    expect(sent[0].recoveryUrl).toMatch(
      /^https:\/\/license\.test\/license\/recover\/complete\?token=/
    )

    const complete = await api(new Request(sent[0].recoveryUrl))
    expect(complete.status).toBe(302)
    expect(complete.headers.get("location")).toBe(
      "https://photosweep.test/recovered?license_recovery=ok"
    )
  })

  it("rejects edited recovery tokens", async () => {
    const keys = testKeys()
    const store = createMemoryLicenseStore()
    const sent: Array<{ email: string; recoveryUrl: string }> = []
    await store.upsertLicense({
      sessionId: "pls_recover_edit",
      planId: "lifetime",
      status: "active",
      email: "buyer@example.com",
      purchasedAt: Date.now()
    })
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store: {
        ...store,
        async sendRecoveryEmail(message: {
          email: string
          recoveryUrl: string
        }) {
          sent.push(message)
        }
      }
    })

    await api(
      new Request("https://license.test/license/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    )
    const recoveryUrl = new URL(sent[0].recoveryUrl)
    recoveryUrl.searchParams.set(
      "token",
      `${recoveryUrl.searchParams.get("token")}edited`
    )

    const response = await api(new Request(recoveryUrl))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://photosweep.test/recovered?license_recovery=invalid"
    )
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("sanitizes analytics payloads before recording", async () => {
    const keys = testKeys()
    const store = createMemoryLicenseStore()
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store
    })

    const response = await api(
      new Request("https://license.test/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "scan_completed",
          provider: "google",
          scanMode: "smart",
          planId: "free",
          photoCountBucket: "1k-5k",
          duplicateGroupCountBucket: "0-99",
          photoUrl: "https://photos.google.com/photo/private",
          filename: "IMG_1234.JPG"
        })
      })
    )

    expect(response.status).toBe(200)
    const snapshot = store.snapshot()
    expect(snapshot.analyticsEvents).toHaveLength(1)
    expect(snapshot.analyticsEvents[0]).toMatchObject({
      name: "scan_completed",
      provider: "google",
      scanMode: "smart",
      planId: "free",
      photoCountBucket: "1k-5k",
      duplicateGroupCountBucket: "0-99",
      errorCategory: undefined
    })
    expect(typeof snapshot.analyticsEvents[0].recordedAt).toBe("number")
    expect(JSON.stringify(snapshot.analyticsEvents)).not.toContain(
      "photos.google.com"
    )
    expect(JSON.stringify(snapshot.analyticsEvents)).not.toContain("IMG_1234")
  })

  it("rejects client attempts to forge payment lifecycle analytics", async () => {
    const keys = testKeys()
    const store = createMemoryLicenseStore()
    const api = createLicenseApi({
      env: envFor(keys.privateKey) as unknown as NodeJS.ProcessEnv,
      store
    })

    const response = await api(
      new Request("https://license.test/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "purchase_completed",
          planId: "lifetime"
        })
      })
    )

    expect(response.status).toBe(400)
    expect(store.snapshot().analyticsEvents).toEqual([])
  })

  it("persists licenses and processed Stripe events in the JSON file store", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photosweep-license-"))
    const storePath = path.join(dir, "licenses.json")
    const store = createJsonFileLicenseStore(storePath)

    await store.upsertLicense({
      sessionId: "pls_file",
      planId: "mini_cleanup",
      status: "active",
      email: "buyer@example.com",
      stripeCustomerId: "cus_file",
      stripeCheckoutSessionId: "cs_file",
      purchasedAt: Date.now()
    })
    await store.markStripeEventProcessed("evt_file")
    await store.recordAnalyticsEvent({
      name: "upgrade_prompt_shown",
      provider: "google",
      scanMode: "smart",
      planId: "free"
    })

    const reloaded = createJsonFileLicenseStore(storePath)
    await expect(
      reloaded.getLicenseBySessionId("pls_file")
    ).resolves.toMatchObject({
      planId: "mini_cleanup",
      status: "active"
    })
    await expect(
      reloaded.getSessionIdByStripeCustomerId("cus_file")
    ).resolves.toBe("pls_file")
    await expect(reloaded.hasProcessedStripeEvent("evt_file")).resolves.toBe(
      true
    )
    const snapshot = await reloaded.snapshot()
    expect(snapshot.analyticsEvents).toHaveLength(1)
    expect(snapshot.analyticsEvents[0]).toMatchObject({
      name: "upgrade_prompt_shown",
      provider: "google",
      scanMode: "smart",
      planId: "free"
    })
  })
})
