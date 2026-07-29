import type { Entitlement, PlanId } from "./entitlement"
import { FREE_ENTITLEMENT, isPlanId } from "./entitlement"
import {
  ALLOW_DEV_ENTITLEMENT,
  DEV_ENTITLEMENT_STORAGE_KEY
} from "./generated/build-flags"

export { ALLOW_DEV_ENTITLEMENT, DEV_ENTITLEMENT_STORAGE_KEY }

export const ENTITLEMENT_STORAGE_KEY = "photoSweepEntitlement"
export const ENTITLEMENT_TOKEN_STORAGE_KEY = "photoSweepEntitlementToken"
export const LICENSE_API_BASE_STORAGE_KEY = "photoSweepLicenseApiBase"
export const LICENSE_API_BASE_URL =
  process.env.PLASMO_PUBLIC_PHOTOSWEEP_LICENSE_API_BASE_URL
export const ENTITLEMENT_PUBLIC_KEY =
  process.env.PLASMO_PUBLIC_PHOTOSWEEP_ENTITLEMENT_PUBLIC_KEY

export interface SignedEntitlementPayload {
  planId: PlanId
  active: boolean
  issuedAt?: number
  expiresAt?: number
}

export interface StoredEntitlement {
  entitlement: Entitlement
  token?: string
  refreshedAt: number
}

export interface CheckoutResponse {
  url: string
}

export interface LicenseClientOptions {
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
}

export interface LoadStoredEntitlementOptions {
  publicKey?: string
  allowDevEntitlement?: boolean
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeBase64UrlJson<T>(value: string): T {
  const bytes = base64UrlToBytes(value)
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json) as T
}

function isSignedEntitlementPayload(
  value: unknown
): value is SignedEntitlementPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  if (!isPlanId(payload.planId)) return false
  if (typeof payload.active !== "boolean") return false
  if (
    payload.issuedAt !== undefined &&
    (typeof payload.issuedAt !== "number" || !Number.isFinite(payload.issuedAt))
  ) {
    return false
  }
  if (
    payload.expiresAt !== undefined &&
    (typeof payload.expiresAt !== "number" || !Number.isFinite(payload.expiresAt))
  ) {
    return false
  }
  return true
}

export async function importEntitlementPublicKey(
  spkiBase64: string
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64UrlToBytes(spkiBase64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  )
}

export async function verifySignedEntitlementToken(
  token: string,
  publicKey: CryptoKey,
  now = Date.now()
): Promise<Entitlement> {
  try {
    const [payloadPart, signaturePart] = token.split(".")
    if (!payloadPart || !signaturePart) return FREE_ENTITLEMENT
    const signatureValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(payloadPart)
    )
    if (!signatureValid) return FREE_ENTITLEMENT
    const payload = decodeBase64UrlJson<unknown>(payloadPart)
    if (!isSignedEntitlementPayload(payload)) return FREE_ENTITLEMENT
    if (!payload.active) return FREE_ENTITLEMENT
    if (payload.expiresAt && payload.expiresAt <= now) return FREE_ENTITLEMENT
    return {
      planId: payload.planId,
      active: payload.active,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      source: "signed_token"
    }
  } catch {
    return FREE_ENTITLEMENT
  }
}

function devEntitlementAllowed(override?: boolean): boolean {
  return (
    DEV_ENTITLEMENT_STORAGE_KEY !== undefined &&
    (override ?? ALLOW_DEV_ENTITLEMENT)
  )
}

export function getEffectiveLicenseApiBaseUrl(
  storedApiBaseUrl?: string
): string | undefined {
  return LICENSE_API_BASE_URL ?? (ALLOW_DEV_ENTITLEMENT ? storedApiBaseUrl : undefined)
}

export async function verifyEntitlementTokenWithBundledKey(
  token: string,
  publicKeyValue = ENTITLEMENT_PUBLIC_KEY
): Promise<Entitlement> {
  if (!publicKeyValue) return FREE_ENTITLEMENT
  try {
    const publicKey = await importEntitlementPublicKey(publicKeyValue)
    return verifySignedEntitlementToken(token, publicKey)
  } catch {
    return FREE_ENTITLEMENT
  }
}

export async function loadStoredEntitlement(
  options: LoadStoredEntitlementOptions = {}
): Promise<StoredEntitlement> {
  const storageKeys = [ENTITLEMENT_STORAGE_KEY, ENTITLEMENT_TOKEN_STORAGE_KEY]
  if (DEV_ENTITLEMENT_STORAGE_KEY) storageKeys.unshift(DEV_ENTITLEMENT_STORAGE_KEY)
  const stored = await chrome.storage.local.get(storageKeys)
  const devEntitlement = DEV_ENTITLEMENT_STORAGE_KEY
    ? (stored[DEV_ENTITLEMENT_STORAGE_KEY] as Entitlement | undefined)
    : undefined
  if (
    devEntitlementAllowed(options.allowDevEntitlement) &&
    devEntitlement?.source === "local_dev"
  ) {
    return {
      entitlement: devEntitlement,
      token: undefined,
      refreshedAt: Date.now()
    }
  }
  const token = stored[ENTITLEMENT_TOKEN_STORAGE_KEY] as string | undefined
  const publicKeyValue = options.publicKey ?? ENTITLEMENT_PUBLIC_KEY
  if (!token || !publicKeyValue) {
    return {
      entitlement: FREE_ENTITLEMENT,
      token,
      refreshedAt: Date.now()
    }
  }
  const entitlement = await verifyEntitlementTokenWithBundledKey(
    token,
    publicKeyValue
  )
  return {
    entitlement,
    token,
    refreshedAt: Date.now()
  }
}

export async function saveStoredEntitlement(
  stored: StoredEntitlement
): Promise<void> {
  await chrome.storage.local.set({
    [ENTITLEMENT_STORAGE_KEY]: stored.entitlement,
    [ENTITLEMENT_TOKEN_STORAGE_KEY]: stored.token
  })
}

export async function saveVerifiedEntitlementToken(
  token: string,
  publicKeyValue = ENTITLEMENT_PUBLIC_KEY
): Promise<StoredEntitlement> {
  const entitlement = await verifyEntitlementTokenWithBundledKey(
    token,
    publicKeyValue
  )
  const stored = {
    entitlement,
    token,
    refreshedAt: Date.now()
  }
  await saveStoredEntitlement(stored)
  return stored
}

export class LicenseClient {
  private readonly apiBaseUrl?: string
  private readonly fetchImpl: typeof fetch

  constructor(options: LicenseClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? LICENSE_API_BASE_URL
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  isConfigured(): boolean {
    return Boolean(this.apiBaseUrl)
  }

  async createCheckout(planId: Exclude<PlanId, "free">): Promise<CheckoutResponse> {
    if (!this.apiBaseUrl) throw new Error("License API is not configured.")
    const response = await this.fetchImpl(`${this.apiBaseUrl}/checkout`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId })
    })
    if (!response.ok) throw new Error("Could not start checkout.")
    return response.json() as Promise<CheckoutResponse>
  }

  async recoverLicense(email: string): Promise<void> {
    if (!this.apiBaseUrl) throw new Error("License API is not configured.")
    const response = await this.fetchImpl(`${this.apiBaseUrl}/license/recover`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (!response.ok) throw new Error("Could not recover license.")
  }

  async fetchEntitlementToken(): Promise<string> {
    if (!this.apiBaseUrl) throw new Error("License API is not configured.")
    const response = await this.fetchImpl(`${this.apiBaseUrl}/entitlement`, {
      credentials: "include"
    })
    if (!response.ok) throw new Error("Could not refresh entitlement.")
    const data = (await response.json()) as { token?: string }
    if (!data.token) throw new Error("Entitlement response did not include a token.")
    return data.token
  }
}
