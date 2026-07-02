import http from "node:http"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createFirestoreLicenseStore } from "./firestore-license-store.mjs"
import { createJsonFileLicenseStore, createLicenseApi } from "./license-api.mjs"

const DEFAULT_PORT = 8787
const DEFAULT_STORE_PATH = ".photosweep/license-store.json"

function requestUrl(nodeRequest, env) {
  const forwardedProto = nodeRequest.headers["x-forwarded-proto"]
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || (env.PHOTOSWEEP_COOKIE_SECURE === "0" ? "http" : "https")
  const host = nodeRequest.headers.host ?? `localhost:${env.PORT ?? DEFAULT_PORT}`
  return `${proto}://${host}${nodeRequest.url ?? "/"}`
}

async function readBody(nodeRequest) {
  const chunks = []
  for await (const chunk of nodeRequest) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function requestHeaders(nodeRequest) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  return headers
}

export function createWebhookRecoveryEmailSender({
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const webhookUrl = env.PHOTOSWEEP_RECOVERY_EMAIL_WEBHOOK_URL
  if (!webhookUrl) return undefined
  return async function sendRecoveryEmail(message) {
    const headers = {
      "content-type": "application/json"
    }
    if (env.PHOTOSWEEP_RECOVERY_EMAIL_WEBHOOK_SECRET) {
      headers.authorization = `Bearer ${env.PHOTOSWEEP_RECOVERY_EMAIL_WEBHOOK_SECRET}`
    }
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "license_recovery",
        email: message.email,
        recoveryUrl: message.recoveryUrl
      })
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `Recovery email webhook failed: ${response.status}${text ? ` ${text}` : ""}`
      )
    }
  }
}

function withRecoveryEmailSender(store, recoveryEmailSender) {
  if (!recoveryEmailSender || typeof store.sendRecoveryEmail === "function") {
    return store
  }
  return {
    ...store,
    sendRecoveryEmail: recoveryEmailSender
  }
}

function createDefaultLicenseStore(env) {
  if (env.PHOTOSWEEP_LICENSE_STORE === "firestore") {
    return createFirestoreLicenseStore({
      collectionPrefix: env.PHOTOSWEEP_FIRESTORE_COLLECTION_PREFIX
    })
  }
  return createJsonFileLicenseStore(
    env.PHOTOSWEEP_LICENSE_STORE_PATH ??
      path.resolve(process.cwd(), DEFAULT_STORE_PATH)
  )
}

export function createNodeRequestHandler({
  env = process.env,
  store = undefined,
  fetchImpl = fetch,
  recoveryEmailSender = undefined,
  api = undefined
} = {}) {
  const baseStore = store ?? createDefaultLicenseStore(env)
  const licenseStore = withRecoveryEmailSender(
    baseStore,
    recoveryEmailSender ??
      createWebhookRecoveryEmailSender({ env, fetchImpl })
  )
  const licenseApi = api ?? createLicenseApi({ env, store: licenseStore, fetchImpl })
  return async function nodeRequestHandler(nodeRequest, nodeResponse) {
    try {
      const method = nodeRequest.method ?? "GET"
      const body =
        method === "GET" || method === "HEAD" ? undefined : await readBody(nodeRequest)
      const response = await licenseApi(
        new Request(requestUrl(nodeRequest, env), {
          method,
          headers: requestHeaders(nodeRequest),
          body
        })
      )

      nodeResponse.statusCode = response.status
      nodeResponse.statusMessage = response.statusText
      response.headers.forEach((value, key) => {
        nodeResponse.setHeader(key, value)
      })
      if (response.body) {
        nodeResponse.end(Buffer.from(await response.arrayBuffer()))
      } else {
        nodeResponse.end()
      }
    } catch (error) {
      nodeResponse.statusCode = 500
      nodeResponse.setHeader("content-type", "application/json")
      nodeResponse.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error)
        })
      )
    }
  }
}

export function startNodeLicenseServer({
  env = process.env,
  port = Number(env.PORT ?? DEFAULT_PORT),
  host = env.HOST ?? "0.0.0.0",
  handler = createNodeRequestHandler({ env })
} = {}) {
  const server = http.createServer(handler)
  server.listen(port, host, () => {
    console.log(`PhotoSweep license API listening on http://${host}:${port}`)
  })
  return server
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? fileURLToPath(pathToFileURL(process.argv[1])) : ""

if (currentFile === invokedFile) {
  startNodeLicenseServer()
}
