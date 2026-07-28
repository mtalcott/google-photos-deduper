import { describe, expect, it, vi } from "vitest"

import { ProviderConnectionSession } from "../../lib/provider-connection-session"

describe("ProviderConnectionSession", () => {
  it("keeps app and provider identity paired", () => {
    const session = new ProviderConnectionSession()
    session.remember(10, 20, "icloud")

    expect(session.mappedProviderTabId(10, "icloud")).toBe(20)
    expect(session.mappedProviderTabId(10, "google")).toBeNull()
    expect(session.mappedProviderTabId(10, "icloud")).toBeNull()
  })

  it("keeps side-panel provider identity separate from tab apps", () => {
    const session = new ProviderConnectionSession()
    session.setHostTab(30)
    session.remember(null, 40, "amazon")

    expect(session.hostTabId).toBe(30)
    expect(session.mappedProviderTabId(null, "amazon")).toBe(40)
    expect(session.mappedProviderTabId(null, "google")).toBeNull()
  })

  it("correlates and finishes commands exactly once", () => {
    const session = new ProviderConnectionSession()
    const command = {
      resolve: vi.fn(),
      reject: vi.fn(),
      appTabId: 10,
      appClientId: "client"
    }
    session.startCommand("request", command)

    expect(session.pendingCommand("request")).toBe(command)
    expect(session.finishCommand("request")).toBe(command)
    expect(session.finishCommand("request")).toBeUndefined()
  })

  it("rejects only the disconnected side-panel client's commands", () => {
    const session = new ProviderConnectionSession()
    const firstReject = vi.fn()
    const secondReject = vi.fn()
    session.startCommand("first", {
      resolve: vi.fn(),
      reject: firstReject,
      appTabId: null,
      appClientId: "first-client"
    })
    session.startCommand("second", {
      resolve: vi.fn(),
      reject: secondReject,
      appTabId: null,
      appClientId: "second-client"
    })

    session.stopClient("first-client")

    expect(firstReject).toHaveBeenCalledWith("Side panel closed.")
    expect(secondReject).not.toHaveBeenCalled()
    expect(session.pendingCommand("second")).toBeDefined()
  })

  it("removes both sides of a tab pair and its pending commands", () => {
    const session = new ProviderConnectionSession()
    session.remember(10, 20, "google")
    session.startCommand("request", {
      resolve: vi.fn(),
      reject: vi.fn(),
      appTabId: 10
    })

    expect(session.removeTab(20)).toBe(10)
    expect(session.mappedProviderTabId(10, "google")).toBeNull()
    session.removeTab(10)
    expect(session.pendingCommand("request")).toBeUndefined()
  })
})
