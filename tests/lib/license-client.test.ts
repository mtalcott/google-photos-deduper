import { beforeEach, describe, expect, it } from "vitest"

import {
  DEV_ENTITLEMENT_STORAGE_KEY,
  ENTITLEMENT_STORAGE_KEY,
  ENTITLEMENT_TOKEN_STORAGE_KEY,
  LICENSE_API_BASE_URL,
  LicenseClient,
  getEffectiveLicenseApiBaseUrl,
  loadStoredEntitlement,
  importEntitlementPublicKey,
  saveVerifiedEntitlementToken,
  verifySignedEntitlementToken,
  verifyEntitlementTokenWithBundledKey,
  type SignedEntitlementPayload
} from "../../lib/license-client"

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function jsonToBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
}

async function signedToken(payload: SignedEntitlementPayload | unknown) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )
  const payloadPart = jsonToBase64Url(payload)
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payloadPart)
  )
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey)
  const publicKeyValue = bytesToBase64Url(spki)
  return {
    token: `${payloadPart}.${bytesToBase64Url(signature)}`,
    publicKey: await importEntitlementPublicKey(publicKeyValue),
    publicKeyValue
  }
}

const storage = new Map<string, unknown>()

beforeEach(() => {
  storage.clear()
  globalThis.chrome = {
    storage: {
      local: {
        clear: (callback?: () => void) => {
          storage.clear()
          callback?.()
        },
        get: (
          keys: string | string[],
          callback?: (result: Record<string, unknown>) => void
        ) => {
          const keyList = Array.isArray(keys) ? keys : [keys]
          const result = Object.fromEntries(
            keyList
              .filter((key) => storage.has(key))
              .map((key) => [key, storage.get(key)])
          )
          callback?.(result)
          return Promise.resolve(result)
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, value)
          callback?.()
          return Promise.resolve()
        }
      }
    }
  } as typeof chrome
})

describe("verifySignedEntitlementToken", () => {
  it("accepts a valid signed entitlement", async () => {
    const { token, publicKey } = await signedToken({
      planId: "lifetime",
      active: true,
      issuedAt: 1000
    })

    await expect(verifySignedEntitlementToken(token, publicKey)).resolves.toMatchObject({
      planId: "lifetime",
      active: true,
      source: "signed_token"
    })
  })

  it("rejects edited tokens", async () => {
    const { token, publicKey } = await signedToken({
      planId: "mini_cleanup",
      active: true
    })
    const [payloadPart, signaturePart] = token.split(".")
    const editedPayload = jsonToBase64Url({ planId: "lifetime", active: true })

    await expect(
      verifySignedEntitlementToken(`${editedPayload}.${signaturePart}`, publicKey)
    ).resolves.toMatchObject({ planId: "free", active: true, source: "none" })
    expect(payloadPart).not.toBe(editedPayload)
  })

  it("rejects expired tokens", async () => {
    const { token, publicKey } = await signedToken({
      planId: "cleanup_pass",
      active: true,
      expiresAt: 1000
    })

    await expect(
      verifySignedEntitlementToken(token, publicKey, 2000)
    ).resolves.toMatchObject({ planId: "free", active: true, source: "none" })
  })

  it("rejects signed tokens with unknown plans", async () => {
    const { token, publicKey } = await signedToken({
      planId: "enterprise",
      active: true
    })

    await expect(verifySignedEntitlementToken(token, publicKey)).resolves.toMatchObject({
      planId: "free",
      active: true,
      source: "none"
    })
  })

  it("rejects signed tokens with malformed expiry values", async () => {
    const { token, publicKey } = await signedToken({
      planId: "cleanup_pass",
      active: true,
      expiresAt: "never"
    })

    await expect(verifySignedEntitlementToken(token, publicKey)).resolves.toMatchObject({
      planId: "free",
      active: true,
      source: "none"
    })
  })

  it("rejects malformed token strings without throwing", async () => {
    const { publicKey } = await signedToken({
      planId: "cleanup_pass",
      active: true
    })

    await expect(
      verifySignedEntitlementToken("not-json.not-signature", publicKey)
    ).resolves.toMatchObject({ planId: "free", active: true, source: "none" })
  })

  it("rejects invalid public key material without throwing", async () => {
    await expect(
      verifyEntitlementTokenWithBundledKey("payload.signature", "not-a-public-key")
    ).resolves.toMatchObject({ planId: "free", active: true, source: "none" })
  })
})

describe("loadStoredEntitlement", () => {
  it("ignores forged normal entitlement storage without a signed token", async () => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      [ENTITLEMENT_STORAGE_KEY]: {
        planId: "lifetime",
        active: true,
        source: "signed_token"
      }
    })

    await expect(loadStoredEntitlement()).resolves.toMatchObject({
      entitlement: { planId: "free", active: true, source: "none" }
    })
  })

  it("allows explicit local_dev storage only through the dev override key", async () => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      [DEV_ENTITLEMENT_STORAGE_KEY]: {
        planId: "lifetime",
        active: true,
        source: "local_dev"
      }
    })

    await expect(
      loadStoredEntitlement({ allowDevEntitlement: true })
    ).resolves.toMatchObject({
      entitlement: { planId: "lifetime", active: true, source: "local_dev" }
    })
  })

  it("ignores local_dev storage when the explicit dev flag is not enabled", async () => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      [DEV_ENTITLEMENT_STORAGE_KEY]: {
        planId: "lifetime",
        active: true,
        source: "local_dev"
      }
    })

    await expect(loadStoredEntitlement()).resolves.toMatchObject({
      entitlement: { planId: "free", active: true, source: "none" }
    })
  })

  it("falls back to free when token verification inputs are incomplete", async () => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      [ENTITLEMENT_TOKEN_STORAGE_KEY]: "payload.signature"
    })

    await expect(loadStoredEntitlement()).resolves.toMatchObject({
      entitlement: { planId: "free", active: true, source: "none" }
    })
  })

  it("does not trust an attacker public key stored locally", async () => {
    const { token, publicKeyValue } = await signedToken({
      planId: "lifetime",
      active: true
    })
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      [ENTITLEMENT_TOKEN_STORAGE_KEY]: token,
      photoSweepEntitlementPublicKey: publicKeyValue
    })

    await expect(loadStoredEntitlement()).resolves.toMatchObject({
      entitlement: { planId: "free", active: true, source: "none" }
    })
  })

  it("loads tokens only when they verify against the bundled public key", async () => {
    const { token, publicKeyValue } = await signedToken({
      planId: "cleanup_pass",
      active: true
    })
    await chrome.storage.local.clear()
    await chrome.storage.local.set({ [ENTITLEMENT_TOKEN_STORAGE_KEY]: token })

    await expect(loadStoredEntitlement({ publicKey: publicKeyValue })).resolves.toMatchObject({
      entitlement: { planId: "cleanup_pass", active: true, source: "signed_token" }
    })
  })

  it("verifies before saving refreshed entitlement tokens", async () => {
    const { token, publicKeyValue } = await signedToken({
      planId: "mini_cleanup",
      active: true
    })

    await expect(
      saveVerifiedEntitlementToken(token, publicKeyValue)
    ).resolves.toMatchObject({
      entitlement: { planId: "mini_cleanup", active: true, source: "signed_token" }
    })
  })
})

describe("getEffectiveLicenseApiBaseUrl", () => {
  it("ignores storage API overrides unless dev entitlement builds allow them", () => {
    const effectiveBaseUrl = getEffectiveLicenseApiBaseUrl("https://attacker.example")

    expect(effectiveBaseUrl).toBe(LICENSE_API_BASE_URL)
    expect(effectiveBaseUrl).not.toBe("https://attacker.example")
  })
})

describe("LicenseClient", () => {
  it("sends credentials on license API requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const client = new LicenseClient({
      apiBaseUrl: "https://license.example",
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlString = String(url)
        calls.push({ url: urlString, init: init ?? {} })
        const body = urlString.endsWith("/entitlement")
          ? { token: "payload.signature" }
          : { url: "https://checkout.example" }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      }) as typeof fetch
    })

    await client.createCheckout("cleanup_pass")
    await client.recoverLicense("buyer@example.com")
    await client.fetchEntitlementToken()

    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.init.credentials === "include")).toBe(true)
  })
})
