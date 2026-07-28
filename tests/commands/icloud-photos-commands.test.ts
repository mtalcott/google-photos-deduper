/**
 * Tests for scripts/icloud-photos-commands.js.
 *
 * @vitest-environment happy-dom
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/photo-provider-command-host.js")
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("../../scripts/icloud-photos-commands.js")
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

describe("iCloud trashItems dry-run", () => {
  it("maps CloudKit media metadata for the shared duplicate pipeline", async () => {
    const { messages, restore } = collectMessages()
    const performanceSpy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([
        {
          name: "https://p167-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query?remapEnums=true&getCurrentSyncToken=true&dsid=123&clientBuildNumber=2622Build17&clientMasteringNumber=2622Build17&clientId=test"
        } as PerformanceEntry
      ])
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [
          {
            recordName: "master-video-1",
            recordType: "CPLMaster",
            recordChangeTag: "tag-master",
            fields: {
              itemType: { value: "public.movie" },
              filenameEnc: { value: btoa("IMG_0001.MOV") },
              resOriginalFingerprint: { value: "original-fingerprint" },
              resOriginalWidth: { value: 1920 },
              resOriginalHeight: { value: 1080 },
              resOriginalRes: {
                value: {
                  size: 1234567,
                  fileChecksum: "original-file-checksum",
                  downloadURL:
                    "https://cvws-h2.icloud-content.com/B/original/${f}"
                }
              },
              resJPEGThumbRes: {
                value: {
                  downloadURL:
                    "https://cvws-h2.icloud-content.com/B/thumb/${f}"
                }
              }
            },
            created: { timestamp: 2000 }
          },
          {
            recordName: "asset-video-1",
            recordType: "CPLAsset",
            recordChangeTag: "tag-asset",
            fields: {
              masterRef: { value: { recordName: "master-video-1" } },
              assetDate: { value: 1000 },
              addedDate: { value: 2000 },
              duration: { value: 12.5 }
            },
            created: { timestamp: 2000 }
          }
        ]
      })
    } as Response)

    sendCommand("getAllMediaItems", "icloud-cloudkit-scan", { limit: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "getAllMediaItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: [
        {
          mediaKey: "icloud-master-video-1",
          dedupKey: "master-video-1",
          exactContentHash: "icloud-fingerprint-original-fingerprint",
          provider: "icloud",
          timestamp: 1000,
          creationTimestamp: 2000,
          resWidth: 1920,
          resHeight: 1080,
          fileName: "IMG_0001.MOV",
          size: 1234567,
          duration: 12500
        }
      ]
    })
    expect(result.data[0].thumb).toBe(
      "https://cvws-h2.icloud-content.com/B/thumb/public.jpeg"
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/records/query?"),
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    )

    fetchSpy.mockRestore()
    performanceSpy.mockRestore()
    restore()
  })

  it("continues CloudKit pagination until the index count is reached", async () => {
    const { messages, restore } = collectMessages()
    const performanceSpy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([
        {
          name: "https://p167-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query?remapEnums=true"
        } as PerformanceEntry
      ])
    const pageRecords = (suffix: string) => [
      {
        recordName: `master-${suffix}`,
        recordType: "CPLMaster",
        fields: {
          itemType: { value: "public.jpeg" },
          filenameEnc: { value: btoa(`IMG_${suffix}.JPG`) },
          resOriginalFingerprint: { value: `fingerprint-${suffix}` },
          resJPEGThumbRes: {
            value: {
              downloadURL:
                `https://cvws-h2.icloud-content.com/B/thumb-${suffix}/\${f}`
            }
          }
        },
        created: { timestamp: 2000 }
      },
      {
        recordName: `asset-${suffix}`,
        recordType: "CPLAsset",
        fields: {
          masterRef: { value: { recordName: `master-${suffix}` } },
          assetDate: { value: 1000 },
          addedDate: { value: 2000 }
        },
        created: { timestamp: 2000 }
      }
    ]
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body || "{}"))
        if (body.batch) {
          return {
            ok: true,
            json: async () => ({
              batch: [
                {
                  records: [
                    {
                      fields: { itemCount: { value: 101 } }
                    }
                  ]
                }
              ]
            })
          } as Response
        }
        const offset =
          body.query.filterBy.find(
            (filter: { fieldName: string }) => filter.fieldName === "startRank"
          )?.fieldValue?.value ?? 0
        return {
          ok: true,
          json: async () => ({
            records: offset === 0 ? pageRecords("A") : pageRecords("B")
          })
        } as Response
      })

    sendCommand("getAllMediaItems", "icloud-cloudkit-pagination", {})
    await new Promise((resolve) => setTimeout(resolve, 900))

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "getAllMediaItems"
    )
    expect(result.success).toBe(true)
    expect(result.data.map((item: { dedupKey: string }) => item.dedupKey)).toEqual([
      "master-A",
      "master-B"
    ])
    expect(fetchSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    )
    expect(
      fetchSpy.mock.calls.some(([, init]) =>
        String(init?.body).includes('"value":100')
      )
    ).toBe(true)

    fetchSpy.mockRestore()
    performanceSpy.mockRestore()
    restore()
  })

  it("moves iCloud items to trash with CloudKit records/modify", async () => {
    const { messages, restore } = collectMessages()
    const performanceSpy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([
        {
          name: "https://p167-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query?remapEnums=true"
        } as PerformanceEntry
      ])
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [
          {
            recordName: "asset-a",
            recordChangeTag: "tag-after-trash",
            zoneID: {
              zoneName: "PrimarySync",
              ownerRecordName: "_defaultOwner"
            }
          }
        ]
      })
    } as Response)

    sendCommand("trashItems", "icloud-trash-real", {
      dedupKeys: ["icloud-a"],
      mediaKeysToTrash: ["icloud-media-a"],
      icloudAssetRefs: [
        {
          recordName: "asset-a",
          changeTag: "tag-before-trash",
          zoneName: "PrimarySync",
          ownerRecordName: "_defaultOwner"
        }
      ]
    })
    await flush()
    await flush()

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/records/modify?"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.stringContaining('"isDeleted":{"value":1}')
      })
    )
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(requestBody).toMatchObject({
      atomic: true,
      zoneID: {
        zoneName: "PrimarySync",
        ownerRecordName: "_defaultOwner"
      },
      operations: [
        {
          operationType: "update",
          record: {
            recordName: "asset-a",
            recordChangeTag: "tag-before-trash",
            recordType: "CPLAsset",
            fields: { isDeleted: { value: 1 } }
          }
        }
      ]
    })

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "trashItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        trashedCount: 1,
        trashedKeys: ["icloud-media-a"],
        trashedDedupKeys: ["icloud-a"],
        icloudAssetRefs: [
          {
            recordName: "asset-a",
            changeTag: "tag-after-trash",
            zoneName: "PrimarySync",
            ownerRecordName: "_defaultOwner"
          }
        ]
      }
    })
    fetchSpy.mockRestore()
    performanceSpy.mockRestore()
    restore()
  })

  it("preserves original iCloud zone metadata when trash response omits zoneID", async () => {
    const { messages, restore } = collectMessages()
    const performanceSpy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([
        {
          name: "https://p167-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query?remapEnums=true"
        } as PerformanceEntry
      ])
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [
          {
            recordName: "asset-a",
            recordChangeTag: "tag-after-trash"
          }
        ]
      })
    } as Response)

    sendCommand("trashItems", "icloud-trash-zone-fallback", {
      dedupKeys: ["icloud-a"],
      mediaKeysToTrash: ["icloud-media-a"],
      icloudAssetRefs: [
        {
          recordName: "asset-a",
          changeTag: "tag-before-trash",
          zoneName: "PrimarySync",
          ownerRecordName: "_defaultOwner"
        }
      ]
    })
    await flush()
    await flush()

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "trashItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        trashedCount: 1,
        icloudAssetRefs: [
          {
            recordName: "asset-a",
            changeTag: "tag-after-trash",
            zoneName: "PrimarySync",
            ownerRecordName: "_defaultOwner"
          }
        ]
      }
    })
    fetchSpy.mockRestore()
    performanceSpy.mockRestore()
    restore()
  })

  it("allows dry-run trash commands without deleting", async () => {
    const { messages, restore } = collectMessages()

    sendCommand("trashItems", "icloud-trash-dry-run", {
      dryRun: true,
      dedupKeys: ["icloud-a", "icloud-b"],
      mediaKeysToTrash: ["icloud-a", "icloud-b"]
    })
    await flush()

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "trashItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        requestedCount: 2,
        trashedCount: 0,
        trashedKeys: [],
        trashedDedupKeys: []
      }
    })
    restore()
  })
})

describe("restoreItems", () => {
  it("restores iCloud trash items with fresh CloudKit asset refs", async () => {
    const { messages, restore } = collectMessages()
    const performanceSpy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([
        {
          name: "https://p167-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query?remapEnums=true"
        } as PerformanceEntry
      ])
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [
          {
            recordName: "asset-a",
            recordChangeTag: "tag-after-restore",
            zoneID: {
              zoneName: "PrimarySync",
              ownerRecordName: "_defaultOwner"
            }
          }
        ]
      })
    } as Response)

    sendCommand("restoreItems", "icloud-restore", {
      dedupKeys: ["icloud-a"],
      icloudAssetRefs: [
        {
          recordName: "asset-a",
          changeTag: "tag-after-trash",
          zoneName: "PrimarySync",
          ownerRecordName: "_defaultOwner"
        }
      ]
    })
    await flush()
    await flush()

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/records/modify?"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.stringContaining('"isDeleted":{"value":0}')
      })
    )

    const result = messages.find(
      (msg) => msg.action === "gptkResult" && msg.command === "restoreItems"
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        restoredCount: 1,
        restoredDedupKeys: ["icloud-a"]
      }
    })
    fetchSpy.mockRestore()
    performanceSpy.mockRestore()
    restore()
  })
})
