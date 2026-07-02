import { describe, expect, it } from "vitest"

import { createFirestoreLicenseStore } from "../../server/firestore-license-store.mjs"

class FakeDocSnapshot {
  constructor(public id: string, private value: unknown) {}
  get exists() {
    return this.value !== undefined
  }
  data() {
    return this.value
  }
}

class FakeQuerySnapshot {
  constructor(public docs: FakeDocSnapshot[]) {}
}

class FakeDocRef {
  constructor(
    private readonly store: Map<string, unknown>,
    public readonly id: string
  ) {}
  async get() {
    return new FakeDocSnapshot(this.id, this.store.get(this.id))
  }
  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const previous = options?.merge ? (this.store.get(this.id) as object) : undefined
    this.store.set(this.id, { ...(previous ?? {}), ...value })
  }
}

class FakeQuery {
  constructor(private docs: FakeDocSnapshot[]) {}
  limit(count: number) {
    return new FakeQuery(this.docs.slice(0, count))
  }
  async get() {
    return new FakeQuerySnapshot(this.docs)
  }
}

class FakeCollectionRef {
  private autoId = 0
  constructor(private readonly store: Map<string, unknown>) {}
  doc(id: string) {
    return new FakeDocRef(this.store, id)
  }
  async add(value: Record<string, unknown>) {
    const id = `auto_${++this.autoId}`
    await this.doc(id).set(value)
    return this.doc(id)
  }
  async get() {
    return new FakeQuerySnapshot(
      [...this.store.entries()].map(([id, value]) => new FakeDocSnapshot(id, value))
    )
  }
  orderBy(field: string, direction: "asc" | "desc") {
    const docs = [...this.store.entries()]
      .map(([id, value]) => new FakeDocSnapshot(id, value))
      .sort((a, b) => {
        const av = (a.data() as Record<string, unknown>)?.[field] as number | undefined
        const bv = (b.data() as Record<string, unknown>)?.[field] as number | undefined
        return direction === "desc" ? (bv ?? 0) - (av ?? 0) : (av ?? 0) - (bv ?? 0)
      })
    return new FakeQuery(docs)
  }
}

class FakeTransaction {
  constructor(private readonly writes: Array<() => Promise<void>>) {}
  get(ref: FakeDocRef) {
    return ref.get()
  }
  set(ref: FakeDocRef, value: Record<string, unknown>, options?: { merge?: boolean }) {
    this.writes.push(() => ref.set(value, options))
  }
}

class FakeFirestore {
  collections = new Map<string, Map<string, unknown>>()
  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new Map())
    return new FakeCollectionRef(this.collections.get(name)!)
  }
  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>) {
    const writes: Array<() => Promise<void>> = []
    const result = await callback(new FakeTransaction(writes))
    for (const write of writes) await write()
    return result
  }
}

describe("createFirestoreLicenseStore", () => {
  it("stores licenses and lookup indexes", async () => {
    const firestore = new FakeFirestore()
    const store = createFirestoreLicenseStore({ firestore: firestore as never })

    await store.upsertLicense({
      sessionId: "sess_1",
      planId: "lifetime",
      status: "active",
      email: "Buyer@Example.com",
      stripeCustomerId: "cus_123",
      stripeCheckoutSessionId: "cs_123",
      stripePaymentIntentId: "pi_123",
      purchasedAt: 1000
    })

    await expect(store.getLicenseBySessionId("sess_1")).resolves.toMatchObject({
      planId: "lifetime",
      status: "active"
    })
    await expect(store.getSessionIdByEmail("buyer@example.com")).resolves.toBe("sess_1")
    await expect(store.getSessionIdByStripeCustomerId("cus_123")).resolves.toBe("sess_1")
    await expect(store.getSessionIdByStripeCheckoutSessionId("cs_123")).resolves.toBe("sess_1")
    await expect(store.getSessionIdByStripePaymentIntentId("pi_123")).resolves.toBe("sess_1")
  })

  it("deactivates licenses and tracks processed Stripe events", async () => {
    const firestore = new FakeFirestore()
    const store = createFirestoreLicenseStore({ firestore: firestore as never })

    await store.upsertLicense({
      sessionId: "sess_2",
      planId: "cleanup_pass",
      status: "active",
      purchasedAt: 1000
    })
    await store.deactivateLicense("sess_2", "charge.refunded")
    await expect(store.getLicenseBySessionId("sess_2")).resolves.toMatchObject({
      status: "inactive",
      inactiveReason: "charge.refunded"
    })

    await expect(store.hasProcessedStripeEvent("evt_1")).resolves.toBe(false)
    await store.markStripeEventProcessed("evt_1")
    await expect(store.hasProcessedStripeEvent("evt_1")).resolves.toBe(true)
  })

  it("records analytics events and exposes a snapshot", async () => {
    const firestore = new FakeFirestore()
    const store = createFirestoreLicenseStore({ firestore: firestore as never })

    await store.recordAnalyticsEvent({ name: "app_opened", planId: "free" })
    const snapshot = await store.snapshot()

    expect(snapshot.analyticsEvents).toHaveLength(1)
    expect(snapshot.analyticsEvents[0]).toMatchObject({ name: "app_opened", planId: "free" })
  })
})
