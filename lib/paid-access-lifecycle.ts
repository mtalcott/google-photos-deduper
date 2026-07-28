import {
  FREE_ENTITLEMENT,
  getEffectivePlanId,
  type Entitlement,
  type PlanId
} from "./entitlement"
import type { CheckoutResponse, StoredEntitlement } from "./license-client"

export interface PaidAccessClient {
  isConfigured(): boolean
  createCheckout(planId: Exclude<PlanId, "free">): Promise<CheckoutResponse>
  recoverLicense(email: string): Promise<void>
  fetchEntitlementToken(): Promise<string>
}

export interface PaidAccessAdapter {
  load(): Promise<{
    stored: StoredEntitlement
    apiBaseUrl?: string
  }>
  saveVerifiedToken(token: string): Promise<StoredEntitlement>
  createClient(apiBaseUrl?: string): PaidAccessClient
}

export class PaidAccessNotConfiguredError extends Error {
  constructor() {
    super("Paid access is not configured.")
    this.name = "PaidAccessNotConfiguredError"
  }
}

export interface PaidAccessRefresh {
  stored: StoredEntitlement
  recovery: "completed" | "not_found" | null
}

export class PaidAccessLifecycle {
  private entitlement: Entitlement = FREE_ENTITLEMENT
  private apiBaseUrl?: string
  private storedTokenPresent = false
  private startupRefreshAttempted = false
  private recoveryPending = false

  constructor(private readonly adapter: PaidAccessAdapter) {}

  async initialize(): Promise<{
    entitlement: Entitlement
    apiBaseUrl?: string
    storedTokenPresent: boolean
  }> {
    const loaded = await this.adapter.load()
    this.entitlement = loaded.stored.entitlement
    this.apiBaseUrl = loaded.apiBaseUrl
    this.storedTokenPresent = Boolean(loaded.stored.token)
    return {
      entitlement: this.entitlement,
      apiBaseUrl: this.apiBaseUrl,
      storedTokenPresent: this.storedTokenPresent
    }
  }

  async refreshStoredTokenOnce(): Promise<PaidAccessRefresh | null> {
    if (!this.storedTokenPresent || this.startupRefreshAttempted) return null
    this.startupRefreshAttempted = true
    return this.refresh()
  }

  async refresh(): Promise<PaidAccessRefresh> {
    const client = this.configuredClient()
    const token = await client.fetchEntitlementToken()
    const stored = await this.adapter.saveVerifiedToken(token)
    this.entitlement = stored.entitlement
    this.storedTokenPresent = Boolean(stored.token)
    const recovery = this.recoveryPending
      ? getEffectivePlanId(stored.entitlement) === "free"
        ? "not_found"
        : "completed"
      : null
    this.recoveryPending = false
    return { stored, recovery }
  }

  async authorizeAction(): Promise<Entitlement> {
    if (getEffectivePlanId(this.entitlement) !== "cleanup_pass") {
      return this.entitlement
    }
    return (await this.refresh()).stored.entitlement
  }

  async createCheckout(
    planId: Exclude<PlanId, "free">
  ): Promise<CheckoutResponse> {
    return this.configuredClient().createCheckout(planId)
  }

  async recover(email: string): Promise<void> {
    await this.configuredClient().recoverLicense(email)
    this.recoveryPending = true
  }

  private configuredClient(): PaidAccessClient {
    const client = this.adapter.createClient(this.apiBaseUrl)
    if (!client.isConfigured()) throw new PaidAccessNotConfiguredError()
    return client
  }
}
