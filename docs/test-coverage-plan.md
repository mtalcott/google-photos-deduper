# QA Audit & Test Coverage Improvement Plan

## Context

The extension has decent unit test coverage of isolated components but is missing an integration test that exercises the full cross-tab messaging pipeline with a stubbed Google Photos backend. The user specifically requested an integration test that loads the real GPTK but stubs Google Photos network traffic.

## Current Coverage Snapshot

| Layer | File(s) | What's Covered |
|---|---|---|
| Unit (Vitest) | `app-reducer`, `duplicate-detector`, `multi-keep` | State machine, dedup logic, keep logic |
| Unit (Vitest) | `duplicate-groups`, `photo-viewer-modal` | React component rendering |
| Unit (Vitest) | `service-worker.test.ts` | Message routing with fully mocked Chrome APIs |
| Integration (Playwright) | `app-tab.test.ts` | 3 UI states via pre-injected storage — no real messaging |
| Full E2E (Playwright) | `scan-flow`, `trash-flow` | Real Google Photos, requires auth |

**Zero coverage:** `contents/google-photos-bridge.ts`, `scripts/google-photos-commands.js`, cross-tab message chain end-to-end, progress updates in UI, tab-close error propagation.

**Zero coverage (added with embedding cache):** `lib/embedding-cache.ts` (all methods), `detectDuplicates` main function (cache-hit path, partial-hit path, IDB-error fallback).

---

## Priority-Ordered Gap List

| # | Gap | Leverage |
|---|---|---|
| 1 | **Cross-tab messaging integration test** (requested) | Highest — no test verifies GPTK → bridge → SW → app tab round-trip |
| 2 | **mock-google-photos.ts fixture** | Blocker for #1 — batchexecute response format is complex |
| 3 | **Tab close mid-operation propagates error** | High safety — common user scenario; `chrome.tabs.onRemoved` path untested end-to-end |
| 4 | **trashItems: verify dedupKeys reach batchexecute** | High correctness — wrong keys = wrong user photos trashed |
| 5 | **Bridge content script unit tests** | Medium — 40-line file, all logic untested; fast Vitest tests |
| 6 | **getAllMediaItems progress updates visible in UI** | Medium — progress chain untested; harder due to MediaPipe thumbnail dependency |
| 7 | **google-photos-commands.js unit tests** | Lower — integration tests cover same paths |
| 8 | **`EmbeddingCache` unit tests** | Medium — IndexedDB wrapper; all 4 methods (`getMany`, `setMany`, `evictExcept`, `open`) untested; use `fake-indexeddb` |
| 9 | **`detectDuplicates` cache-hit/fallback paths** | Medium — cache-hit path skips thumbnail+embedding steps; IDB-error fallback resets to full scan; neither path is exercised by existing tests |

---

## Implementation Plan

### Step 1 — `tests/e2e/fixtures/mock-google-photos.ts`

New fixture providing Playwright route interception for Google Photos. Called on the `BrowserContext` from `launchExtension()` before navigating to photos.google.com.

**Key technical facts confirmed from source:**
- `windowGlobalData.ts` reads `eptZe` (not `ePtZe`) for the path field
- URL constructed as: `https://photos.google.com${windowGlobalData.path}data/batchexecute`
- So `eptZe` should be `"/_/PhotosUi/"` → URL becomes `/_/PhotosUi/data/batchexecute`
- `makeApiRequest` response parsing: split on `\n`, find line with `wrb.fr`, `JSON.parse(line)[0][2]` is a JSON-encoded payload string

**Fake HTML served at `https://photos.google.com/`:**
```html
<!DOCTYPE html><html>
<head>
  <title>Google Photos (mock)</title>
  <script>
    window.WIZ_global_data = {
      SNlM0e: "fake-at-token",
      FdrFJe: "-1234567890",
      cfb2h: "fake-bl",
      eptZe: "/_/PhotosUi/",
      oPEP7c: "test@example.com"
    };
  </script>
</head>
<body><div id="app">Google Photos (mock)</div></body>
</html>
```

**`buildBatchexecuteResponse(rpcid, payload)`** — produces the wire format:
```
)]}'\n[[["wrb.fr","<rpcid>","<JSON.stringify(payload)>",null,null,null,"generic"]]]\n
```

**`buildLibraryGenericPagePayload(items: FakeMediaItem[], nextPageId = null)`** — produces the payload for `EzkLib`. Confirmed structure from `parser.ts:libraryItemParse()`:
```typescript
// payload = [itemsArray, nextPageId]
// Each item array (minimum safe structure):
[
  mediaKey,              // [0]
  [thumb, width, height], // [1]
  timestamp,             // [2]
  dedupKey,              // [3]
  null,                  // [4] timezoneOffset
  creationTimestamp,     // [5]
  null, [], null, null, null, null, null, null, null, null,
  {}                     // at(-1) — optional metadata object
]
```

**Route handler logic:**
```typescript
context.route('https://photos.google.com/**', async (route) => {
  const url = route.request().url()
  if (url === 'https://photos.google.com/' || url === 'https://photos.google.com') {
    return route.fulfill({ contentType: 'text/html', body: FAKE_GP_HTML })
  }
  if (url.includes('batchexecute')) {
    // capture call, determine rpcid from URL ?rpcids= param
    // return configured response
    return route.fulfill({ body: buildBatchexecuteResponse(...) })
  }
  // favicon, static assets, etc. — abort cleanly
  return route.abort()
})
```

**Public API of the fixture:**
```typescript
export async function setupMockGooglePhotos(
  context: BrowserContext,
  options?: {
    mediaItems?: FakeMediaItem[]   // items returned from getAllMediaItems
    trashShouldSucceed?: boolean   // default true
    delayMs?: number               // artificial delay for batchexecute (for tab-close test)
  }
): Promise<{
  getBatchexecuteCalls(): CapturedRequest[]  // for asserting dedupKeys
  unroute(): Promise<void>                   // call in afterEach
}>
```

**`FakeMediaItem` type:**
```typescript
interface FakeMediaItem {
  mediaKey: string; dedupKey: string
  thumb?: string       // use a stable interceptable URL: "https://photos.google.com/fake-thumb/1.jpg"
  timestamp?: number; creationTimestamp?: number
  resWidth?: number; resHeight?: number
}
```

For thumbnail route interception: intercept `https://photos.google.com/fake-thumb/**` and return a hardcoded 1×1 JPEG (base64). This lets MediaPipe compute embeddings for all items. Using the **same** URL for all items means identical embeddings → similarity = 1.0 → they form duplicate groups.

**Captured request type:**
```typescript
interface CapturedRequest {
  rpcid: string         // from ?rpcids= URL param
  postData: string      // raw body
  decodedFReq: unknown  // JSON.parse(decodeURIComponent(urlParams.get("f.req")))
}
```

To decode trash dedupKeys from a captured request:
```typescript
const fReq = JSON.parse(decodeURIComponent(new URLSearchParams(call.postData).get("f.req")))
const requestData = JSON.parse(fReq[0][0][1])  // inner encoded string
const dedupKeys = requestData[2]               // [null, 1, dedupKeyArray, 3]
```

---

### Step 2 — `tests/e2e/integration/messaging-flow.test.ts`

Uses `launchExtension()` + `setupMockGooglePhotos()`. Playwright config: `playwright.config.ts` (same as `app-tab.test.ts`). Requires `npm run dev` build.

**Test setup pattern:**
```typescript
let context: BrowserContext, extensionId: string, gpPage: Page, mock: MockGP

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtension())
})
test.afterAll(async () => { await context.close() })
test.beforeEach(async () => {
  await clearStorage(context)
  mock = await setupMockGooglePhotos(context, { mediaItems: buildFakeMediaItems(2) })
  gpPage = await context.newPage()
  await gpPage.goto('https://photos.google.com/')
  // Wait for GPTK to fully load in MAIN world before opening app tab
  await gpPage.waitForFunction(() => typeof window.gptkApi !== 'undefined', { timeout: 15_000 })
})
test.afterEach(async () => {
  await gpPage.close()
  await mock.unroute()
})
```

**Test 1: `healthCheck flows end-to-end`**
```
1. Open app tab (after gpPage is ready per beforeEach)
2. Assert "Scan Library" button visible (timeout: 10s) — proves status === "connected"
3. Assert "test@example.com" visible in UI — proves accountEmail propagated correctly
```
Full chain exercised: app tab → SW → bridge → MAIN world healthCheck → postResult → bridge → SW → app tab.

**Test 2: `tab close mid-operation returns error to app tab`**

Override mock in this test to use a slow batchexecute handler (6s delay via `delayMs` option):
```typescript
mock = await setupMockGooglePhotos(context, { mediaItems: [...], delayMs: 6000 })
```
Steps:
```
1. Open app tab, wait for connected state
2. Click "Scan Library"
3. Wait for scanning indicator ("Fetching" text)
4. Close gpPage: await gpPage.close()
5. Assert app tab shows disconnected/error state within 5s
```
Service worker `chrome.tabs.onRemoved` → sends `gptkLog` error → app tab dispatches `GP_TAB_CLOSED`.

**Test 3: `trashItems sends correct dedupKeys to batchexecute`**
```
1. Build 2 fake items with same thumb URL (same dedupKey values known in test)
2. Open app tab, scan library
3. Wait for "1 Duplicate Group Found" (same thumb → same embedding → similarity 1.0)
4. Click "Move N Duplicates to Trash", confirm dialog
5. Wait for undo snackbar (trash success)
6. const calls = mock.getBatchexecuteCalls().filter(c => c.rpcid === 'XwAOJf')
7. Decode dedupKeys from calls[0]
8. Assert exactly 1 dedupKey present (the non-kept duplicate)
```

**Test 4: `getAllMediaItems sends progress and completes scan`** (optional, more complex)
```
1. Build 4 fake items (2 pairs with shared thumb URLs)
2. Open app tab, click Scan Library
3. Assert progress text like /Fetched \d+ items/ appears during scanning
4. Wait for results showing 2 duplicate groups (timeout: 60s for MediaPipe)
```
Note: MediaPipe loads WASM from the extension build; thumbnail fetch succeeds via fake-thumb route. May be slow.

---

### Step 3 — `tests/contents/google-photos-bridge.test.ts`

Vitest unit test. Uses same pattern as `service-worker.test.ts`: set up chrome mock globally, capture listener arrays, import module in `beforeAll`.

**Mock setup:**
```typescript
const runtimeListeners: ((msg, sender, sendResponse) => void)[] = []
const sentMessages: unknown[] = []

vi.stubGlobal('chrome', {
  runtime: {
    onMessage: { addListener: vi.fn(fn => runtimeListeners.push(fn)) },
    sendMessage: vi.fn(msg => sentMessages.push(msg))
  }
})

beforeAll(async () => { await import('../../contents/google-photos-bridge') })
beforeEach(() => { vi.clearAllMocks(); sentMessages.length = 0 })
```

**Note on `import type`:** The bridge has `import type { PlasmoCSConfig } from "plasmo"` — type-only, erased at runtime. No mock needed for Plasmo. `import { APP_ID } from "../lib/types"` resolves fine.

**Test cases (8):**
1. Forwards `gptkResult` from `window.postMessage` to `chrome.runtime.sendMessage`
2. Forwards `gptkProgress` from window to runtime
3. Forwards `gptkLog` from window to runtime
4. Does NOT forward `gptkCommand` from window to runtime (command goes the other direction)
5. Ignores window messages where `event.source !== window`
6. Ignores window messages with wrong `app` field
7. Forwards `gptkCommand` from chrome.runtime to `window.postMessage` (use `vi.spyOn(window, 'postMessage')`)
8. Does NOT forward non-`gptkCommand` messages from runtime to window

---

### Step 4 — `tests/lib/embedding-cache.test.ts`

Vitest unit test. Use the `fake-indexeddb` package to provide an in-memory IndexedDB implementation (install: `npm install -D fake-indexeddb`).

**Setup:**
```typescript
import "fake-indexeddb/auto"  // replaces globalThis.indexedDB with in-memory impl
import { EmbeddingCache } from "../../lib/embedding-cache"

beforeEach(() => {
  // fake-indexeddb resets between tests only if you re-open; use unique DB names
  // or reset via IDBFactory.deleteDatabase between tests
})
```

**Test cases (10):**
1. `open()` — resolves to an EmbeddingCache instance without throwing
2. `open()` twice — both resolve (idempotent)
3. `getMany([])` — returns empty array
4. `getMany` for unknown keys — returns array of nulls (all misses)
5. `setMany` then `getMany` — round-trips embeddings correctly (Float32Array values preserved)
6. `getMany` with mixed hits/misses — returns correct embedding at hit indices, null at miss indices
7. `setMany` overwrites existing entry — get returns updated value
8. `setMany([])` — resolves without error (no-op)
9. `evictExcept` — deletes keys not in the keep set, returns evicted count
10. `evictExcept` with all keys in keep set — returns 0, no entries deleted

**Note on `detectDuplicates` cache paths:** The cache-hit and IDB-error-fallback branches in `detectDuplicates` are difficult to unit test because the function also invokes MediaPipe and `fetch`. These paths are best covered by the integration test (Test 3/4 in messaging-flow.test.ts — cache is implicitly cold on first scan). A second-scan integration test could verify the hit path but is low priority given MediaPipe's 60s runtime.

---

## Files to Create

| File | Type | Runner |
|---|---|---|
| `tests/e2e/fixtures/mock-google-photos.ts` | New fixture | Playwright |
| `tests/e2e/integration/messaging-flow.test.ts` | New tests | Playwright (`npm run test:integration`) |
| `tests/contents/google-photos-bridge.test.ts` | New tests | Vitest (`npm test`) |
| `tests/lib/embedding-cache.test.ts` | New tests | Vitest (`npm test`) |

## Files to Modify

None — all additions.

---

## Verification

**Unit tests (bridge):**
```bash
npm test -- tests/contents/google-photos-bridge.test.ts
```
Expect 8 tests passing in ~2s.

**Unit tests (embedding cache):**
```bash
npm test -- tests/lib/embedding-cache.test.ts
```
Expect 10 tests passing in ~2s. Requires `fake-indexeddb` dev dependency.

**Integration tests (messaging flow):**
```bash
npm run dev   # keep running in background (watches for changes)
npm run test:integration
```
Tests 1–3 should complete in ~30s. Test 4 (if included) may need ~60s for MediaPipe.

**Confirm full suite still passes:**
```bash
npm test && npm run test:integration
```

---

## Key Assumptions to Verify at Impl Time

1. **`eptZe` path value**: Use `"/_/PhotosUi/"` so the constructed batchexecute URL is `https://photos.google.com/_/PhotosUi/data/batchexecute`. Verify this URL is what Playwright route intercepts.
2. **Thumbnail MediaPipe flow**: Confirm `https://photos.google.com/fake-thumb/1.jpg` route returns a valid JPEG that MediaPipe can process (1×1 JPEG base64 should work).
3. **Service worker tab query**: Confirm `chrome.tabs.query({ url: "https://photos.google.com/*" })` matches a tab where navigation was fulfilled by Playwright route interception.
4. **GPTK inject timing**: `waitForFunction(() => typeof window.gptkApi !== 'undefined')` in the GP page is the correct sync point before opening the app tab.
