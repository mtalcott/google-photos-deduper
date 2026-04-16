import { describe, it, expect } from "vitest"
import { appReducer } from "../../lib/app-reducer"
import type { AppState } from "../../lib/app-reducer"
import type { GpdMediaItem, DuplicateGroup } from "../../lib/types"
import { APP_ID } from "../../lib/types"

// ============================================================
// Fixtures
// ============================================================

function makeItem(mediaKey: string, dedupKey = `dk-${mediaKey}`): GpdMediaItem {
  return {
    mediaKey,
    dedupKey,
    thumb: `https://example.com/${mediaKey}`,
    timestamp: 0,
    creationTimestamp: 0,
    resWidth: 100,
    resHeight: 100,
    duration: null,
    isOwned: true,
    fileName: `${mediaKey}.jpg`,
  }
}

function makeGroup(id: string, ...mediaKeys: string[]): DuplicateGroup {
  return {
    id,
    mediaKeys,
    originalMediaKey: mediaKeys[0],
    similarity: 0.99,
  }
}

const mediaItems: Record<string, GpdMediaItem> = {
  img1: makeItem("img1"),
  img2: makeItem("img2"),
  img3: makeItem("img3"),
  img4: makeItem("img4"),
}

const groups: DuplicateGroup[] = [
  makeGroup("g1", "img1", "img2"),
  makeGroup("g2", "img3", "img4"),
]

const resultsState: AppState = {
  status: "results",
  mediaItems,
  groups,
  totalItems: 4,
}

const trashingState: AppState = {
  status: "trashing",
  mediaItems,
  groups,
  totalItems: 4,
  totalToTrash: 2,
  trashedSoFar: 0,
}

// ============================================================
// HEALTH_CHECK_RESULT
// ============================================================

describe("HEALTH_CHECK_RESULT", () => {
  it("moves to connected when GP is reachable", () => {
    const next = appReducer(
      { status: "connecting" },
      {
        type: "HEALTH_CHECK_RESULT",
        payload: { app: APP_ID, action: "healthCheck.result", success: true, hasGptk: true },
      }
    )
    expect(next).toMatchObject({ status: "connected", hasGptk: true })
  })

  it("moves to disconnected when GP is unreachable", () => {
    const next = appReducer(
      { status: "connecting" },
      {
        type: "HEALTH_CHECK_RESULT",
        payload: { app: APP_ID, action: "healthCheck.result", success: false, hasGptk: false },
      }
    )
    expect(next.status).toBe("disconnected")
  })

  it("does NOT downgrade from results when health check succeeds", () => {
    const next = appReducer(resultsState, {
      type: "HEALTH_CHECK_RESULT",
      payload: { app: APP_ID, action: "healthCheck.result", success: true, hasGptk: true },
    })
    expect(next.status).toBe("results")
    expect(next).toBe(resultsState)
  })

  it("does NOT disconnect from results when health check fails (GP tab not open)", () => {
    // User has results; GP tab closed or not open. They can still view results.
    const next = appReducer(resultsState, {
      type: "HEALTH_CHECK_RESULT",
      payload: { app: APP_ID, action: "healthCheck.result", success: false, hasGptk: false },
    })
    expect(next.status).toBe("results")
    expect(next).toBe(resultsState)
  })

  it("clears results and moves to connected when a different account is detected", () => {
    const state: AppState = { status: "results", mediaItems, groups, totalItems: 4, accountEmail: "alice@example.com" }
    const next = appReducer(state, {
      type: "HEALTH_CHECK_RESULT",
      payload: { app: APP_ID, action: "healthCheck.result", success: true, hasGptk: true, accountEmail: "bob@example.com" },
    })
    expect(next.status).toBe("connected")
    expect((next as { accountEmail?: string }).accountEmail).toBe("bob@example.com")
  })

  it("keeps results when the same account reconnects", () => {
    const state: AppState = { status: "results", mediaItems, groups, totalItems: 4, accountEmail: "alice@example.com" }
    const next = appReducer(state, {
      type: "HEALTH_CHECK_RESULT",
      payload: { app: APP_ID, action: "healthCheck.result", success: true, hasGptk: true, accountEmail: "alice@example.com" },
    })
    expect(next.status).toBe("results")
    expect(next).toBe(state)
  })
})

// ============================================================
// SCAN_STARTED / SCAN_COMPLETE
// ============================================================

describe("SCAN_STARTED", () => {
  it("enters scanning state with correct initial values", () => {
    const next = appReducer(
      { status: "connected", hasGptk: true },
      { type: "SCAN_STARTED", requestId: "req-1", hasGptk: true }
    )
    expect(next).toMatchObject({
      status: "scanning",
      phase: "fetching",
      itemsProcessed: 0,
      requestId: "req-1",
    })
  })
})

describe("SCAN_COMPLETE", () => {
  it("sets results with correct totalItems count", () => {
    const next = appReducer(
      { status: "scanning", phase: "fetching", itemsProcessed: 0, totalEstimate: 0, message: "", requestId: "r", hasGptk: true },
      { type: "SCAN_COMPLETE", mediaItems, groups }
    )
    expect(next).toMatchObject({
      status: "results",
      totalItems: 4,
      groups,
    })
  })
})

describe("SCAN_ERROR", () => {
  it("enters disconnected state", () => {
    const next = appReducer(
      { status: "scanning", phase: "fetching", itemsProcessed: 0, totalEstimate: 0, message: "", requestId: "r", hasGptk: true },
      { type: "SCAN_ERROR", error: "network failure" }
    )
    expect(next.status).toBe("disconnected")
  })
})

// ============================================================
// TRASH_PROGRESS
// ============================================================

describe("TRASH_PROGRESS", () => {
  it("updates trashedSoFar while in trashing state", () => {
    const next = appReducer(trashingState, { type: "TRASH_PROGRESS", trashedSoFar: 250 })
    expect(next.status).toBe("trashing")
    if (next.status === "trashing") expect(next.trashedSoFar).toBe(250)
  })

  it("is a no-op outside trashing state", () => {
    const next = appReducer(resultsState, { type: "TRASH_PROGRESS", trashedSoFar: 250 })
    expect(next).toBe(resultsState)
  })
})

// ============================================================
// TRASH_COMPLETE — critical: correct items removed, groups collapsed
// ============================================================

describe("TRASH_COMPLETE", () => {
  it("removes trashed keys from mediaItems", () => {
    const next = appReducer(trashingState, {
      type: "TRASH_COMPLETE",
      trashedKeys: ["img2"],
    })
    expect(next.status).toBe("results")
    if (next.status === "results") {
      expect("img2" in next.mediaItems).toBe(false)
      expect("img1" in next.mediaItems).toBe(true)
    }
  })

  it("collapses groups to fewer than 2 members when both non-originals trashed", () => {
    // Trash both members of g1 → group should be removed
    const next = appReducer(trashingState, {
      type: "TRASH_COMPLETE",
      trashedKeys: ["img1", "img2"],
    })
    if (next.status === "results") {
      expect(next.groups.find((g) => g.id === "g1")).toBeUndefined()
    }
  })

  it("keeps a group that still has 2+ members after trash", () => {
    const threeItemGroup = makeGroup("g3", "img1", "img2", "img3")
    const state: AppState = {
      status: "trashing",
      mediaItems,
      groups: [threeItemGroup],
      totalItems: 3,
      totalToTrash: 1,
      trashedSoFar: 0,
    }
    const next = appReducer(state, {
      type: "TRASH_COMPLETE",
      trashedKeys: ["img3"],
    })
    if (next.status === "results") {
      const g = next.groups.find((g) => g.id === "g3")
      expect(g).toBeDefined()
      expect(g!.mediaKeys).toEqual(["img1", "img2"])
    }
  })

  it("does nothing when called from non-trashing state", () => {
    const next = appReducer(resultsState, {
      type: "TRASH_COMPLETE",
      trashedKeys: ["img1"],
    })
    // State is unchanged (TRASH_COMPLETE is a no-op outside trashing)
    expect(next).toBe(resultsState)
  })
})

// ============================================================
// RESTORE_SNAPSHOT
// ============================================================

describe("RESTORE_SNAPSHOT", () => {
  it("restores previous results state", () => {
    const next = appReducer(
      { status: "results", mediaItems: {}, groups: [], totalItems: 0 },
      {
        type: "RESTORE_SNAPSHOT",
        mediaItems,
        groups,
        totalItems: 4,
      }
    )
    expect(next).toMatchObject({ status: "results", totalItems: 4 })
    if (next.status === "results") {
      expect(next.groups).toHaveLength(2)
    }
  })
})

// ============================================================
// GP_TAB_CLOSED
// ============================================================

describe("GP_TAB_CLOSED", () => {
  it("moves to disconnected from any state", () => {
    for (const state of [
      { status: "connecting" } as AppState,
      { status: "connected", hasGptk: true } as AppState,
      resultsState,
    ]) {
      const next = appReducer(state, { type: "GP_TAB_CLOSED" })
      expect(next.status).toBe("disconnected")
    }
  })
})

// ============================================================
// RESET
// ============================================================

describe("RESET", () => {
  it("returns to connecting from any state", () => {
    const next = appReducer(resultsState, { type: "RESET" })
    expect(next).toEqual({ status: "connecting" })
  })
})
