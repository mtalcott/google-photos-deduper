import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const PLAN_CONFIG = {
  mini_cleanup: {
    stripePriceEnv: "PHOTOSWEEP_STRIPE_PRICE_MINI_CLEANUP",
    expiresInMs: undefined
  },
  cleanup_pass: {
    stripePriceEnv: "PHOTOSWEEP_STRIPE_PRICE_CLEANUP_PASS_7D",
    expiresInMs: 7 * 24 * 60 * 60 * 1000
  },
  lifetime: {
    stripePriceEnv: "PHOTOSWEEP_STRIPE_PRICE_LIFETIME_EARLY_ACCESS",
    expiresInMs: undefined
  }
}

const COOKIE_NAME = "photosweep_license_session"
const STRIPE_API_BASE = "https://api.stripe.com/v1"
const STRIPE_API_VERSION = "2026-02-25.clover"
const LONG_LIVED_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ANALYTICS_EVENT_NAMES = new Set([
  "app_opened",
  "scan_started",
  "scan_completed",
  "upgrade_prompt_shown",
  "checkout_started",
  "restore_requested",
  "restore_completed",
  "restore_not_found",
  "entitlement_refreshed",
  "export_clicked",
  "trash_attempted",
  "trash_completed",
  "error"
])
const ANALYTICS_PROVIDERS = new Set(["google", "icloud", "amazon"])
const ANALYTICS_SCAN_MODES = new Set(["smart", "full"])
const ANALYTICS_PLAN_IDS = new Set([
  "free",
  "mini_cleanup",
  "cleanup_pass",
  "lifetime"
])
const MAX_STORED_ANALYTICS_EVENTS = 1000

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  })
}

function htmlResponse(title, message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:640px;margin:64px auto;padding:0 20px;line-height:1.5;color:#18211f}a{color:#0f766e}</style></head><body><h1>${title}</h1><p>${message}</p><p>You can close this tab and return to PhotoSweep.</p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  )
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")
  const allowed = (env.PHOTOSWEEP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (!origin || !allowed.includes(origin)) return {}
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "content-type,stripe-signature,x-photosweep-license-session",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    vary: "origin"
  }
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function badRequest(message) {
  return jsonResponse({ error: message }, { status: 400 })
}

function unauthorized() {
  return jsonResponse({ error: "License session is missing." }, { status: 401 })
}

function requireEnv(env, key) {
  const value = env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function parseCookie(header) {
  const result = new Map()
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=")
    if (index <= 0) continue
    result.set(
      part.slice(0, index).trim(),
      decodeURIComponent(part.slice(index + 1))
    )
  }
  return result
}

function getSessionId(request) {
  return (
    parseCookie(request.headers.get("cookie")).get(COOKIE_NAME) ??
    request.headers.get("x-photosweep-license-session") ??
    undefined
  )
}

function optionalEnum(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : undefined
}

function optionalBucket(value) {
  return typeof value === "string" && /^[0-9k+<>=-]+$/.test(value)
    ? value
    : undefined
}

function sanitizeAnalyticsEvent(input) {
  if (!input || typeof input !== "object") return undefined
  const name = optionalEnum(input.name, ANALYTICS_EVENT_NAMES)
  if (!name) return undefined
  return {
    name,
    provider: optionalEnum(input.provider, ANALYTICS_PROVIDERS),
    scanMode: optionalEnum(input.scanMode, ANALYTICS_SCAN_MODES),
    planId: optionalEnum(input.planId, ANALYTICS_PLAN_IDS),
    photoCountBucket: optionalBucket(input.photoCountBucket),
    duplicateGroupCountBucket: optionalBucket(input.duplicateGroupCountBucket),
    errorCategory:
      typeof input.errorCategory === "string"
        ? input.errorCategory.slice(0, 80)
        : undefined
  }
}

function sessionCookie(sessionId, env) {
  const secure = env.PHOTOSWEEP_COOKIE_SECURE !== "0"
  return [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=None",
    secure ? "Secure" : "",
    "Max-Age=2592000"
  ]
    .filter(Boolean)
    .join("; ")
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`
}

function now() {
  return Date.now()
}

const PLAN_PRIORITY = {
  mini_cleanup: 1,
  cleanup_pass: 2,
  lifetime: 3
}

function withoutPurchaseLedger(license) {
  if (!license) return undefined
  const { purchases: _purchases, ...purchase } = license
  return purchase
}

function purchasesForLicense(license) {
  if (!license) return []
  return Array.isArray(license.purchases)
    ? license.purchases
    : [withoutPurchaseLedger(license)]
}

function isActivePurchase(purchase, at = now()) {
  return (
    purchase?.status === "active" &&
    (!purchase.expiresAt || purchase.expiresAt > at)
  )
}

function effectivePurchase(purchases, at = now()) {
  return purchases
    .filter((purchase) => isActivePurchase(purchase, at))
    .sort(
      (left, right) =>
        (PLAN_PRIORITY[right.planId] ?? 0) -
          (PLAN_PRIORITY[left.planId] ?? 0) ||
        (right.purchasedAt ?? 0) - (left.purchasedAt ?? 0)
    )[0]
}

function licenseFromPurchases(sessionId, purchases) {
  const selected =
    effectivePurchase(purchases) ??
    [...purchases].sort(
      (left, right) => (right.purchasedAt ?? 0) - (left.purchasedAt ?? 0)
    )[0]
  if (!selected) return undefined
  return {
    ...selected,
    sessionId,
    purchases
  }
}

function purchaseMatchesStripeObject(purchase, object) {
  return (
    (typeof object?.payment_intent === "string" &&
      purchase.stripePaymentIntentId === object.payment_intent) ||
    (typeof object?.checkout_session === "string" &&
      purchase.stripeCheckoutSessionId === object.checkout_session) ||
    (typeof object?.id === "string" &&
      (purchase.stripeCheckoutSessionId === object.id ||
        purchase.stripePaymentIntentId === object.id))
  )
}

function activeLicenseToEntitlement(license) {
  const issuedAt = now()
  if (!license || license.status !== "active") {
    return {
      planId: "free",
      active: true,
      issuedAt,
      expiresAt: issuedAt + LONG_LIVED_TOKEN_TTL_MS
    }
  }
  if (license.expiresAt && license.expiresAt <= issuedAt) {
    return {
      planId: "free",
      active: true,
      issuedAt,
      expiresAt: issuedAt + LONG_LIVED_TOKEN_TTL_MS
    }
  }
  const tokenExpiresAt = issuedAt + LONG_LIVED_TOKEN_TTL_MS
  return {
    planId: license.planId,
    active: true,
    issuedAt,
    expiresAt: license.expiresAt
      ? Math.min(license.expiresAt, tokenExpiresAt)
      : tokenExpiresAt
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url")
}

function decodeStripeTimestamp(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  return (
    aBuffer.length === bBuffer.length &&
    crypto.timingSafeEqual(aBuffer, bBuffer)
  )
}

function recoverySecret(env) {
  return env.PHOTOSWEEP_RECOVERY_SECRET || privateKeyFromEnv(env)
}

function signRecoveryPayload(payloadPart, env) {
  return crypto
    .createHmac("sha256", recoverySecret(env))
    .update(payloadPart)
    .digest("base64url")
}

function createRecoveryToken(payload, env) {
  const payloadPart = encodeBase64Url(JSON.stringify(payload))
  return `${payloadPart}.${signRecoveryPayload(payloadPart, env)}`
}

function verifyRecoveryToken(token, env) {
  const [payloadPart, signature] = String(token ?? "").split(".")
  if (!payloadPart || !signature) return undefined
  const expected = signRecoveryPayload(payloadPart, env)
  if (!timingSafeEqualString(signature, expected)) return undefined
  try {
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8")
    )
    if (!payload || typeof payload !== "object") return undefined
    if (typeof payload.sessionId !== "string") return undefined
    if (typeof payload.email !== "string") return undefined
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= now()) {
      return undefined
    }
    return payload
  } catch {
    return undefined
  }
}

function verifyStripeSignature(
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = 300
) {
  const parts = new Map()
  for (const item of (signatureHeader ?? "").split(",")) {
    const [key, value] = item.split("=", 2)
    if (!key || !value) continue
    if (!parts.has(key)) parts.set(key, [])
    parts.get(key).push(value)
  }
  const timestamp = decodeStripeTimestamp(parts.get("t")?.[0])
  if (!timestamp) return false
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (age > toleranceSeconds) return false
  const signedPayload = `${timestamp}.${rawBody}`
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex")
  return (parts.get("v1") ?? []).some((signature) =>
    timingSafeEqualString(signature, expected)
  )
}

function privateKeyFromEnv(env) {
  const value = requireEnv(env, "PHOTOSWEEP_ENTITLEMENT_PRIVATE_KEY")
  if (value.includes("BEGIN PRIVATE KEY")) return value
  return Buffer.from(value, "base64url").toString("utf8")
}

export function signEntitlementToken(payload, env) {
  const payloadPart = encodeBase64Url(JSON.stringify(payload))
  const signature = crypto.sign("sha256", Buffer.from(payloadPart), {
    key: privateKeyFromEnv(env),
    dsaEncoding: "ieee-p1363"
  })
  return `${payloadPart}.${signature.toString("base64url")}`
}

export async function createStripeCheckoutSession(
  input,
  env,
  fetchImpl = fetch
) {
  const plan = PLAN_CONFIG[input.planId]
  if (!plan) throw new Error("Unknown plan.")
  const priceId = requireEnv(env, plan.stripePriceEnv)
  const apiKey = requireEnv(env, "STRIPE_SECRET_KEY")
  const successUrl = requireEnv(env, "PHOTOSWEEP_CHECKOUT_SUCCESS_URL")
  const cancelUrl = requireEnv(env, "PHOTOSWEEP_CHECKOUT_CANCEL_URL")
  const body = new URLSearchParams()
  body.set("mode", "payment")
  body.set("line_items[0][price]", priceId)
  body.set("line_items[0][quantity]", "1")
  body.set("success_url", successUrl)
  body.set("cancel_url", cancelUrl)
  body.set("client_reference_id", input.sessionId)
  body.set("metadata[planId]", input.planId)
  body.set("metadata[licenseSessionId]", input.sessionId)
  if (input.email) body.set("customer_email", input.email)
  const response = await fetchImpl(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "stripe-version": STRIPE_API_VERSION,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Stripe checkout failed: ${text}`)
  }
  return response.json()
}

export function createMemoryLicenseStore(seed = {}) {
  const state = {
    licensesBySessionId: new Map(
      Object.entries(seed.licensesBySessionId ?? {})
    ),
    sessionByEmail: new Map(Object.entries(seed.sessionByEmail ?? {})),
    sessionByStripeCustomerId: new Map(
      Object.entries(seed.sessionByStripeCustomerId ?? {})
    ),
    sessionByStripeCheckoutSessionId: new Map(
      Object.entries(seed.sessionByStripeCheckoutSessionId ?? {})
    ),
    sessionByStripePaymentIntentId: new Map(
      Object.entries(seed.sessionByStripePaymentIntentId ?? {})
    ),
    processedStripeEvents: new Set(seed.processedStripeEvents ?? []),
    analyticsEvents: [...(seed.analyticsEvents ?? [])]
  }
  return {
    async getLicenseBySessionId(sessionId) {
      return state.licensesBySessionId.get(sessionId)
    },
    async upsertLicense(license) {
      state.licensesBySessionId.set(license.sessionId, license)
      for (const purchase of purchasesForLicense(license)) {
        if (purchase.email) {
          state.sessionByEmail.set(
            purchase.email.toLowerCase(),
            license.sessionId
          )
        }
        if (purchase.stripeCustomerId) {
          state.sessionByStripeCustomerId.set(
            purchase.stripeCustomerId,
            license.sessionId
          )
        }
        if (purchase.stripeCheckoutSessionId) {
          state.sessionByStripeCheckoutSessionId.set(
            purchase.stripeCheckoutSessionId,
            license.sessionId
          )
        }
        if (purchase.stripePaymentIntentId) {
          state.sessionByStripePaymentIntentId.set(
            purchase.stripePaymentIntentId,
            license.sessionId
          )
        }
      }
    },
    async deactivateLicense(sessionId, reason) {
      const existing = state.licensesBySessionId.get(sessionId)
      if (!existing) return
      const purchases = purchasesForLicense(existing).map((purchase) => ({
        ...purchase,
        status: "inactive",
        inactiveReason: reason
      }))
      state.licensesBySessionId.set(
        sessionId,
        licenseFromPurchases(sessionId, purchases)
      )
    },
    async getSessionIdByEmail(email) {
      return state.sessionByEmail.get(email.toLowerCase())
    },
    async getSessionIdByStripeCustomerId(customerId) {
      return state.sessionByStripeCustomerId.get(customerId)
    },
    async getSessionIdByStripeCheckoutSessionId(checkoutSessionId) {
      return state.sessionByStripeCheckoutSessionId.get(checkoutSessionId)
    },
    async getSessionIdByStripePaymentIntentId(paymentIntentId) {
      return state.sessionByStripePaymentIntentId.get(paymentIntentId)
    },
    async hasProcessedStripeEvent(eventId) {
      return state.processedStripeEvents.has(eventId)
    },
    async markStripeEventProcessed(eventId) {
      state.processedStripeEvents.add(eventId)
    },
    async recordAnalyticsEvent(event) {
      state.analyticsEvents.push({
        ...event,
        recordedAt: now()
      })
      if (state.analyticsEvents.length > MAX_STORED_ANALYTICS_EVENTS) {
        state.analyticsEvents.splice(
          0,
          state.analyticsEvents.length - MAX_STORED_ANALYTICS_EVENTS
        )
      }
    },
    snapshot() {
      return {
        licensesBySessionId: Object.fromEntries(state.licensesBySessionId),
        sessionByEmail: Object.fromEntries(state.sessionByEmail),
        sessionByStripeCustomerId: Object.fromEntries(
          state.sessionByStripeCustomerId
        ),
        sessionByStripeCheckoutSessionId: Object.fromEntries(
          state.sessionByStripeCheckoutSessionId
        ),
        sessionByStripePaymentIntentId: Object.fromEntries(
          state.sessionByStripePaymentIntentId
        ),
        processedStripeEvents: [...state.processedStripeEvents],
        analyticsEvents: [...state.analyticsEvents]
      }
    }
  }
}

export function createJsonFileLicenseStore(filePath) {
  async function readState() {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"))
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          licensesBySessionId: {},
          sessionByEmail: {},
          sessionByStripeCustomerId: {},
          sessionByStripeCheckoutSessionId: {},
          sessionByStripePaymentIntentId: {},
          processedStripeEvents: [],
          analyticsEvents: []
        }
      }
      throw error
    }
  }

  async function writeState(state) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(state, null, 2))
  }

  async function mutate(mutator) {
    const state = await readState()
    const result = await mutator(state)
    await writeState(state)
    return result
  }

  return {
    async getLicenseBySessionId(sessionId) {
      const state = await readState()
      return state.licensesBySessionId[sessionId]
    },
    async upsertLicense(license) {
      await mutate((state) => {
        state.licensesBySessionId[license.sessionId] = license
        for (const purchase of purchasesForLicense(license)) {
          if (purchase.email) {
            state.sessionByEmail[purchase.email.toLowerCase()] = license.sessionId
          }
          if (purchase.stripeCustomerId) {
            state.sessionByStripeCustomerId[purchase.stripeCustomerId] =
              license.sessionId
          }
          if (purchase.stripeCheckoutSessionId) {
            state.sessionByStripeCheckoutSessionId[
              purchase.stripeCheckoutSessionId
            ] = license.sessionId
          }
          if (purchase.stripePaymentIntentId) {
            state.sessionByStripePaymentIntentId[
              purchase.stripePaymentIntentId
            ] = license.sessionId
          }
        }
      })
    },
    async deactivateLicense(sessionId, reason) {
      await mutate((state) => {
        const existing = state.licensesBySessionId[sessionId]
        if (!existing) return
        const purchases = purchasesForLicense(existing).map((purchase) => ({
          ...purchase,
          status: "inactive",
          inactiveReason: reason
        }))
        state.licensesBySessionId[sessionId] = licenseFromPurchases(
          sessionId,
          purchases
        )
      })
    },
    async getSessionIdByEmail(email) {
      const state = await readState()
      return state.sessionByEmail[email.toLowerCase()]
    },
    async getSessionIdByStripeCustomerId(customerId) {
      const state = await readState()
      return state.sessionByStripeCustomerId[customerId]
    },
    async getSessionIdByStripeCheckoutSessionId(checkoutSessionId) {
      const state = await readState()
      return state.sessionByStripeCheckoutSessionId[checkoutSessionId]
    },
    async getSessionIdByStripePaymentIntentId(paymentIntentId) {
      const state = await readState()
      return state.sessionByStripePaymentIntentId[paymentIntentId]
    },
    async hasProcessedStripeEvent(eventId) {
      const state = await readState()
      return state.processedStripeEvents.includes(eventId)
    },
    async markStripeEventProcessed(eventId) {
      await mutate((state) => {
        state.processedStripeEvents ??= []
        if (!state.processedStripeEvents.includes(eventId)) {
          state.processedStripeEvents.push(eventId)
        }
      })
    },
    async recordAnalyticsEvent(event) {
      await mutate((state) => {
        state.analyticsEvents ??= []
        state.analyticsEvents.push({
          ...event,
          recordedAt: now()
        })
        if (state.analyticsEvents.length > MAX_STORED_ANALYTICS_EVENTS) {
          state.analyticsEvents.splice(
            0,
            state.analyticsEvents.length - MAX_STORED_ANALYTICS_EVENTS
          )
        }
      })
    },
    async snapshot() {
      return readState()
    }
  }
}

function planExpiry(planId, purchasedAt) {
  const plan = PLAN_CONFIG[planId]
  return plan?.expiresInMs ? purchasedAt + plan.expiresInMs : undefined
}

function sessionFromStripeObject(object) {
  return object?.metadata?.licenseSessionId ?? object?.client_reference_id
}

async function activateCheckoutSession(session, store) {
  const planId = session?.metadata?.planId
  const sessionId = sessionFromStripeObject(session)
  if (!PLAN_CONFIG[planId] || !sessionId || session.payment_status !== "paid") {
    return undefined
  }
  const existing = await store.getLicenseBySessionId(sessionId)
  const purchases = purchasesForLicense(existing)
  if (
    purchases.some(
      (purchase) => purchase.stripeCheckoutSessionId === session.id
    )
  ) {
    return undefined
  }
  const purchasedAt = now()
  const purchase = {
    planId,
    status: "active",
    email:
      session.customer_details?.email ??
      session.customer_email ??
      session.metadata?.email,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : undefined,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : undefined,
    purchasedAt,
    expiresAt: planExpiry(planId, purchasedAt)
  }
  const license = licenseFromPurchases(sessionId, [...purchases, purchase])
  await store.upsertLicense(license)
  return purchase
}

async function deactivateStripeObject(object, store, reason) {
  let sessionId = sessionFromStripeObject(object)
  if (!sessionId && typeof object?.payment_intent === "string") {
    sessionId = await store.getSessionIdByStripePaymentIntentId(
      object.payment_intent
    )
  }
  if (!sessionId && typeof object?.checkout_session === "string") {
    sessionId = await store.getSessionIdByStripeCheckoutSessionId(
      object.checkout_session
    )
  }
  if (!sessionId) return undefined
  const license = await store.getLicenseBySessionId(sessionId)
  if (!license) return undefined
  let deactivated
  const purchases = purchasesForLicense(license).map((purchase) => {
    if (!purchaseMatchesStripeObject(purchase, object)) return purchase
    deactivated = purchase
    return {
      ...purchase,
      status: "inactive",
      inactiveReason: reason
    }
  })
  if (!deactivated) return undefined
  await store.upsertLicense(licenseFromPurchases(sessionId, purchases))
  return deactivated
}

function isFullChargeRefund(charge) {
  if (
    typeof charge?.amount === "number" &&
    typeof charge?.amount_refunded === "number"
  ) {
    return charge.amount_refunded >= charge.amount
  }
  return true
}

async function recordMonetizationEvent(store, event) {
  if (typeof store.recordAnalyticsEvent === "function") {
    await store.recordAnalyticsEvent(event)
  }
}

async function deactivateExpiredCheckoutSession(session, store) {
  if (!sessionFromStripeObject(session) || !session?.id) return
  await deactivateStripeObject(session, store, "checkout.session.expired")
}

export async function handleStripeWebhook(request, env, store) {
  const rawBody = await request.text()
  const signature = request.headers.get("stripe-signature")
  const secret = requireEnv(env, "STRIPE_WEBHOOK_SECRET")
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return jsonResponse({ error: "Invalid Stripe signature." }, { status: 400 })
  }
  const event = JSON.parse(rawBody)
  if (await store.hasProcessedStripeEvent(event.id)) {
    return jsonResponse({ received: true, duplicate: true })
  }
  const object = event.data?.object
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const license = await activateCheckoutSession(object, store)
    if (license) {
      await recordMonetizationEvent(store, {
        name: "purchase_completed",
        planId: license.planId
      })
    }
  } else if (event.type === "checkout.session.expired") {
    await deactivateExpiredCheckoutSession(object, store)
  } else if (event.type === "checkout.session.async_payment_failed") {
    await recordMonetizationEvent(store, {
      name: "purchase_failed",
      planId: object?.metadata?.planId
    })
  } else if (
    event.type === "charge.dispute.created" ||
    (event.type === "charge.refunded" && isFullChargeRefund(object))
  ) {
    const license = await deactivateStripeObject(object, store, event.type)
    if (license) {
      await recordMonetizationEvent(store, {
        name:
          event.type === "charge.refunded"
            ? "purchase_refunded"
            : "purchase_failed",
        planId: license.planId
      })
    }
  }
  await store.markStripeEventProcessed(event.id)
  return jsonResponse({ received: true })
}

export async function handleCheckout(request, env, store, fetchImpl = fetch) {
  const body = await request.json().catch(() => ({}))
  const planId = body.planId
  if (!PLAN_CONFIG[planId]) return badRequest("Unknown plan.")
  const sessionId = getSessionId(request) ?? randomId("pls")
  const checkout = await createStripeCheckoutSession(
    { planId, sessionId, email: body.email },
    env,
    fetchImpl
  )
  if (!checkout.url)
    return jsonResponse(
      { error: "Stripe did not return a checkout URL." },
      { status: 502 }
    )
  return jsonResponse(
    { url: checkout.url },
    { headers: { "set-cookie": sessionCookie(sessionId, env) } }
  )
}

export async function handleEntitlement(request, env, store) {
  const sessionId = getSessionId(request)
  if (!sessionId) return unauthorized()
  const license = await store.getLicenseBySessionId(sessionId)
  const token = signEntitlementToken(activeLicenseToEntitlement(license), env)
  return jsonResponse({ token })
}

export async function handleRecoverLicense(request, env, store) {
  const body = await request.json().catch(() => ({}))
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !email.includes("@"))
    return badRequest("A valid email is required.")
  const sessionId = await store.getSessionIdByEmail(email)
  if (sessionId && typeof store.sendRecoveryEmail === "function") {
    const token = createRecoveryToken(
      {
        email,
        sessionId,
        expiresAt: now() + 30 * 60 * 1000
      },
      env
    )
    const recoveryBaseUrl = requireEnv(env, "PHOTOSWEEP_RECOVERY_BASE_URL")
    const recoveryUrl = new URL("/license/recover/complete", recoveryBaseUrl)
    recoveryUrl.searchParams.set("token", token)
    await store.sendRecoveryEmail({
      email,
      recoveryUrl: recoveryUrl.toString()
    })
  }
  if (env.PHOTOSWEEP_UNSAFE_EMAIL_RECOVERY !== "1") {
    return jsonResponse({ ok: true })
  }
  if (!sessionId) return jsonResponse({ ok: true })
  return jsonResponse(
    { ok: true },
    { headers: { "set-cookie": sessionCookie(sessionId, env) } }
  )
}

export async function handleCompleteLicenseRecovery(request, env, store) {
  const url = new URL(request.url)
  const payload = verifyRecoveryToken(url.searchParams.get("token"), env)
  const redirectTo =
    env.PHOTOSWEEP_RECOVERY_REDIRECT_URL ||
    env.PHOTOSWEEP_CHECKOUT_SUCCESS_URL ||
    "https://photosweep.app"
  if (!payload) {
    return new Response(null, {
      status: 302,
      headers: { location: `${redirectTo}?license_recovery=invalid` }
    })
  }
  const license = await store.getLicenseBySessionId(payload.sessionId)
  if (
    !license ||
    license.email?.toLowerCase() !== payload.email.toLowerCase()
  ) {
    return new Response(null, {
      status: 302,
      headers: { location: `${redirectTo}?license_recovery=invalid` }
    })
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: `${redirectTo}?license_recovery=ok`,
      "set-cookie": sessionCookie(payload.sessionId, env)
    }
  })
}

export async function handleAnalytics(request, env, store) {
  const body = await request.json().catch(() => undefined)
  const event = sanitizeAnalyticsEvent(body)
  if (!event) return badRequest("Invalid analytics event.")
  if (typeof store.recordAnalyticsEvent === "function") {
    await store.recordAnalyticsEvent(event)
  }
  return jsonResponse({ ok: true })
}

export function createLicenseApi({
  env = process.env,
  store,
  fetchImpl = fetch
} = {}) {
  const licenseStore = store ?? createMemoryLicenseStore()
  return async function handleRequest(request) {
    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }))
    }
    const url = new URL(request.url)
    try {
      let response
      if (request.method === "POST" && url.pathname === "/checkout") {
        response = await handleCheckout(request, env, licenseStore, fetchImpl)
      } else if (request.method === "GET" && url.pathname === "/entitlement") {
        response = await handleEntitlement(request, env, licenseStore)
      } else if (
        request.method === "POST" &&
        url.pathname === "/license/recover"
      ) {
        response = await handleRecoverLicense(request, env, licenseStore)
      } else if (
        request.method === "GET" &&
        url.pathname === "/license/recover/complete"
      ) {
        response = await handleCompleteLicenseRecovery(
          request,
          env,
          licenseStore
        )
      } else if (request.method === "POST" && url.pathname === "/analytics") {
        response = await handleAnalytics(request, env, licenseStore)
      } else if (
        request.method === "POST" &&
        url.pathname === "/stripe/webhook"
      ) {
        response = await handleStripeWebhook(request, env, licenseStore)
      } else if (
        request.method === "GET" &&
        url.pathname === "/checkout/success"
      ) {
        response = htmlResponse(
          "Checkout complete",
          "Your payment was received. Return to PhotoSweep and click Refresh license to unlock your plan."
        )
      } else if (
        request.method === "GET" &&
        url.pathname === "/checkout/cancel"
      ) {
        response = htmlResponse(
          "Checkout canceled",
          "No payment was completed. PhotoSweep will continue using your current plan."
        )
      } else {
        response = jsonResponse({ error: "Not found." }, { status: 404 })
      }
      return withCors(request, env, response)
    } catch (error) {
      return withCors(
        request,
        env,
        jsonResponse(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        )
      )
    }
  }
}
