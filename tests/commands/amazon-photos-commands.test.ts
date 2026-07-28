/**
 * Tests for scripts/amazon-photos-commands.js.
 *
 * @vitest-environment happy-dom
 * @vitest-environment-options {"url":"https://www.amazon.ca/photos?sf=1"}
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/photo-provider-command-host.js")
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/amazon-photos-commands.js")
})

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function sendCommand(command: string, requestId: string, args: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: { app: "GPD", action: "gptkCommand", command, requestId, args }
    })
  )
}

function collectMessages(): { messages: any[]; restore: () => void } {
  const messages: any[] = []
  const spy = vi.spyOn(window, "postMessage").mockImplementation((msg) => {
    messages.push(msg)
  })
  return { messages, restore: () => spy.mockRestore() }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function amazonNode(id: string) {
  return {
    id,
    ownerId: "owner-1",
    name: `${id}.jpg`,
    createdDate: "2026-06-28T12:00:00.000Z",
    contentProperties: {
      contentType: "image/jpeg",
      contentDate: "2026-06-28T12:00:00.000Z"
    },
    image: {
      width: 1200,
      height: 800
    }
  }
}

function amazonNodeWithCreatedDate(id: string, createdDate: string) {
  return {
    ...amazonNode(id),
    createdDate,
    contentProperties: {
      ...amazonNode(id).contentProperties,
      contentDate: createdDate
    }
  }
}

function amazonVideoNode(id: string) {
  return {
    id,
    ownerId: "owner-1",
    name: `${id}.mp4`,
    createdDate: "2026-06-28T12:00:00.000Z",
    contentProperties: {
      contentType: "video/mp4",
      contentDate: "2026-06-28T12:00:00.000Z",
      md5: "abc123",
      size: 123456,
      video: {
        width: 1920,
        height: 1080,
        duration: 12.345
      }
    }
  }
}

describe("Amazon getAllMediaItems", () => {
  it("uses sinceTimestamp to stop after cached Amazon items", async () => {
    vi.useFakeTimers()
    const { messages, restore } = collectMessages()
    const sinceTimestamp = Date.parse("2026-06-20T00:00:00.000Z")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 400,
            data: [
              amazonNodeWithCreatedDate("new-node", "2026-06-28T00:00:00.000Z")
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 400,
            data: [
              amazonNodeWithCreatedDate("old-node", "2026-06-01T00:00:00.000Z")
            ]
          })
      })
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("getAllMediaItems", "amazon-incremental", {
      limit: 400,
      sinceTimestamp
    })
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const result = messages.find(
      (msg) =>
        msg.action === "gptkResult" &&
        msg.command === "getAllMediaItems" &&
        msg.requestId === "amazon-incremental"
    )
    expect(result?.data).toEqual([
      expect.objectContaining({ mediaKey: "amazon-new-node" })
    ])
    restore()
    vi.useRealTimers()
  })

  it("maps Amazon video metadata for shared duplicate detection", async () => {
    const { messages, restore } = collectMessages()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          count: 1,
          data: [amazonVideoNode("video-node")]
        })
    })
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("getAllMediaItems", "amazon-video-mapping", { limit: 1 })
    await flush()
    await flush()

    const result = messages.find(
      (msg) =>
        msg.action === "gptkResult" &&
        msg.command === "getAllMediaItems" &&
        msg.requestId === "amazon-video-mapping"
    )
    expect(result?.data?.[0]).toMatchObject({
      mediaKey: "amazon-video-node",
      dedupKey: "video-node",
      exactContentHash: "amazon-md5-abc123",
      resWidth: 1920,
      resHeight: 1080,
      duration: 12345,
      size: 123456
    })
    restore()
  })

  it("waits and retries when Amazon rate-limits a search page", async () => {
    vi.useFakeTimers()
    const { messages, restore } = collectMessages()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 400,
            data: [amazonNode("node-a")]
          })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: () => Promise.resolve('{"message":"Rate exceeded"}')
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 400,
            data: [amazonNode("node-b")]
          })
      })
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("getAllMediaItems", "amazon-rate-limit", { limit: 400 })
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(15000)
    await flushMicrotasks()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(
      messages.some((msg) =>
        String(msg.message || "").includes("Amazon rate limit hit at offset 200")
      )
    ).toBe(true)
    const result = messages.find(
      (msg) =>
        msg.action === "gptkResult" &&
        msg.command === "getAllMediaItems" &&
        msg.requestId === "amazon-rate-limit"
    )
    expect(result).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({ mediaKey: "amazon-node-a" }),
        expect.objectContaining({ mediaKey: "amazon-node-b" })
      ]
    })
    restore()
    vi.useRealTimers()
  })
})

describe("Amazon trashItems", () => {
  it("moves selected node ids to Amazon Photos trash", async () => {
    const { messages, restore } = collectMessages()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    })
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("trashItems", "amazon-trash", {
      dedupKeys: ["node-a", "node-b"],
      mediaKeysToTrash: ["amazon-node-a", "amazon-node-b"],
      batchSize: 25
    })
    await flush()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.amazon.ca/drive/v1/trash",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({
          recurse: "true",
          op: "add",
          filters: "",
          conflictResolution: "RENAME",
          value: ["node-a", "node-b"],
          resourceVersion: "V2",
          ContentType: "JSON"
        })
      })
    )
    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "trashItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        trashedCount: 2,
        trashedKeys: ["amazon-node-a", "amazon-node-b"],
        trashedDedupKeys: ["node-a", "node-b"]
      }
    })
    restore()
  })

  it("caps Amazon trash batches at 50 node ids", async () => {
    const { restore } = collectMessages()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    })
    vi.stubGlobal("fetch", fetchMock)
    const dedupKeys = Array.from({ length: 51 }, (_, index) => `node-${index}`)
    const mediaKeysToTrash = dedupKeys.map((key) => `amazon-${key}`)

    sendCommand("trashItems", "amazon-trash-batches", {
      dedupKeys,
      mediaKeysToTrash,
      batchSize: 999
    })
    await flush()
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).value).toHaveLength(50)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).value).toEqual([
      "node-50"
    ])
    restore()
  })
})

// Amazon restore = same /drive/v1/trash endpoint as trash, with op:"remove".
// Mirrors the trash chunking/retry path; the Undo button relies on this.
describe("restoreItems", () => {
  it("restores selected node ids from Amazon Photos trash with op:remove", async () => {
    const { messages, restore } = collectMessages()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    })
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("restoreItems", "amazon-restore", {
      dedupKeys: ["node-a", "node-b"],
      batchSize: 25
    })
    await flush()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.amazon.ca/drive/v1/trash",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({
          op: "remove",
          conflictResolution: "RENAME",
          value: ["node-a", "node-b"]
        })
      })
    )
    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "restoreItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        restoredCount: 2,
        restoredDedupKeys: ["node-a", "node-b"]
      }
    })
    restore()
  })

  it("caps Amazon restore batches at 50 node ids", async () => {
    const { restore } = collectMessages()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    })
    vi.stubGlobal("fetch", fetchMock)
    const dedupKeys = Array.from({ length: 51 }, (_, index) => `node-${index}`)

    sendCommand("restoreItems", "amazon-restore-batches", {
      dedupKeys,
      batchSize: 999
    })
    await flush()
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).value).toHaveLength(50)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).value).toEqual([
      "node-50"
    ])
    restore()
  })

  it("rejects restore without valid dedupKeys", async () => {
    const { messages, restore } = collectMessages()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    sendCommand("restoreItems", "amazon-restore-invalid", {})
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "restoreItems"
    )
    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain("dedupKeys")
    restore()
  })
})
