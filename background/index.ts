import {
  getProviderOperations,
  providerLabel as providerName,
  providerMatchesUrl,
  providerOpenUrl,
  providerTabPatterns
} from "../lib/provider-operations"
import { ProviderConnectionSession } from "../lib/provider-connection-session"
import { APP_ID } from "../lib/types"
import type {
  AppMessage,
  GpdMediaItem,
  GptkCommandMessage,
  GptkProgressMessage,
  GptkResultMessage,
  LaunchProviderResult,
  PhotoProvider
} from "../lib/types"

// Service worker for PhotoSweep.
// Routes messages between the app tab and the active photo-provider tab.

const connectionSession = new ProviderConnectionSession()

type ChromeWithSidePanel = typeof chrome & {
  sidePanel?: {
    setPanelBehavior?: (options: {
      openPanelOnActionClick: boolean
    }) => Promise<void>
    setOptions?: (options: {
      tabId?: number
      path?: string
      enabled?: boolean
    }) => Promise<void>
    open?: (options: { tabId?: number; windowId?: number }) => Promise<void>
  }
}

const sidePanelApi = (chrome as ChromeWithSidePanel).sidePanel
const SIDE_PANEL_PATH = "tabs/scanner-panel.html"
const GPTK_COMMAND_TIMEOUT_MS = 3500

function disableDefaultSidePanel(): void {
  if (!sidePanelApi?.setOptions) return
  sidePanelApi.setOptions({ enabled: false }).catch((error) => {
    console.warn("[GPD] unable to disable default side panel", error)
  })
}

disableDefaultSidePanel()

function configureActionSidePanelBehavior(): void {
  if (!sidePanelApi?.setPanelBehavior) return
  sidePanelApi
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.warn(
        "[GPD] unable to configure side panel action behavior",
        error
      )
    })
}

async function enableSidePanelForTab(tabId: number): Promise<void> {
  if (!sidePanelApi?.setOptions) return
  await sidePanelApi.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true
  })
}

function enableActiveSidePanels(): void {
  chrome.tabs
    .query({ active: true })
    .then((tabs) => {
      for (const tab of tabs) {
        if (hasTabId(tab)) {
          enableSidePanelForTab(tab.id).catch((error) => {
            console.warn("[GPD] unable to enable tab side panel", error)
          })
        }
      }
    })
    .catch(() => {})
}

configureActionSidePanelBehavior()

function providerOpenUrlForTab(
  provider: PhotoProvider,
  tab: Pick<chrome.tabs.Tab, "url"> | undefined
): string {
  if (!tab?.url || !providerMatchesUrl(tab.url, provider)) {
    return providerOpenUrl(provider)
  }
  try {
    const url = new URL(tab.url)
    return providerOpenUrl(provider, url.origin)
  } catch {
    // Fall back to the default provider URL.
  }
  return providerOpenUrl(provider)
}

function isProviderPhotosPage(
  tab: Pick<chrome.tabs.Tab, "url"> | undefined,
  provider: PhotoProvider
): boolean {
  return providerMatchesUrl(tab?.url, provider, true)
}

function tabMatchesProvider(
  tab: Pick<chrome.tabs.Tab, "url"> | undefined,
  provider: PhotoProvider
): boolean {
  return providerMatchesUrl(tab?.url, provider)
}

function canNavigateTabToProvider(tab: Pick<chrome.tabs.Tab, "url">): boolean {
  return !tab.url?.startsWith("chrome-extension://")
}

function hasTabId(tab: Pick<chrome.tabs.Tab, "id">): tab is chrome.tabs.Tab & {
  id: number
} {
  return tab.id !== undefined && tab.id !== null
}

function isSidePanelSender(sender: chrome.runtime.MessageSender): boolean {
  return Boolean(
    sender.url?.includes(SIDE_PANEL_PATH) ||
      sender.tab?.url?.includes(SIDE_PANEL_PATH)
  )
}

// ============================================================
// Find tabs
// ============================================================

/**
 * Find a Google Photos tab that the bridge content script can actually reach.
 *
 * When the user has multiple photos.google.com tabs open (e.g. opened before
 * the extension was installed, or duplicated via the "Open Google Photos"
 * button), picking the first one returned by chrome.tabs.query is unreliable:
 * the bridge may not be loaded in it, and chrome.tabs.sendMessage rejects with
 * "Receiving end does not exist", surfacing as a spurious "Cannot connect to
 * Google Photos" error.
 *
 * Strategy: prefer the active tab, then sort by lastAccessed descending, and
 * ping each one until we find a reachable bridge. The bridge ignores
 * unrecognized actions, so a no-op ping resolves with undefined when reachable
 * and rejects when no content script is present.
 */
async function findProviderTab(
  provider: PhotoProvider = "google",
  preferredTabId?: number | null
): Promise<chrome.tabs.Tab | null> {
  if (preferredTabId !== undefined && preferredTabId !== null) {
    try {
      const preferredTab = await chrome.tabs.get(preferredTabId)
      if (
        hasTabId(preferredTab) &&
        tabMatchesProvider(preferredTab, provider) &&
        (await ensureProviderBridge(preferredTab.id, provider))
      ) {
        return preferredTab
      }
    } catch {
      // Fall back to scanning provider tabs below.
    }
  }

  const tabResults = await Promise.all(
    providerTabPatterns(provider).map((url) => chrome.tabs.query({ url }))
  )
  const tabs = tabResults.flat()
  if (tabs.length === 0) return null

  // `lastAccessed` is available in Chrome 121+ but missing from this version
  // of @types/chrome.
  type TabWithLastAccessed = chrome.tabs.Tab & { lastAccessed?: number }
  const sorted = [...tabs].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const aAccessed = (a as TabWithLastAccessed).lastAccessed ?? 0
    const bAccessed = (b as TabWithLastAccessed).lastAccessed ?? 0
    return bAccessed - aAccessed
  })

  for (const candidate of sorted) {
    if (!hasTabId(candidate)) continue
    if (await ensureProviderBridge(candidate.id, provider)) {
      return candidate
    }
  }
  return null
}

async function pingProviderBridge(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      app: APP_ID,
      action: "ping"
    })
    return true
  } catch {
    return false
  }
}

async function ensureGoogleMainWorldScripts(tabId: number): Promise<boolean> {
  const [ready] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => ({
      hasGptk: typeof window.gptkApi !== "undefined",
      hasCommandHost: Boolean(
        (
          window as typeof window & {
            __GPD_COMMAND_HOST__?: unknown
          }
        ).__GPD_COMMAND_HOST__
      ),
      hasCommandHandler: Boolean(
        (
          window as typeof window & {
            __GPD_GOOGLE_COMMAND_HANDLER_LOADED__?: boolean
          }
        ).__GPD_GOOGLE_COMMAND_HANDLER_LOADED__
      )
    })
  })
  const state = ready?.result as
    | {
        hasGptk?: boolean
        hasCommandHost?: boolean
        hasCommandHandler?: boolean
      }
    | undefined
  if (state?.hasGptk && state.hasCommandHost && state.hasCommandHandler) {
    return true
  }

  if (!state?.hasGptk) {
    for (const file of [
      "scripts/unsafewindow-shim.js",
      "scripts/google-photos-toolkit.user.js"
    ]) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        files: [file]
      })
    }
  }

  if (!state?.hasCommandHost) {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["scripts/photo-provider-command-host.js"]
    })
  }

  if (!state?.hasCommandHandler) {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["scripts/google-photos-commands.js"]
    })
  }

  const [after] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => ({
      hasGptk: typeof window.gptkApi !== "undefined",
      hasCommandHost: Boolean(
        (
          window as typeof window & {
            __GPD_COMMAND_HOST__?: unknown
          }
        ).__GPD_COMMAND_HOST__
      ),
      hasCommandHandler: Boolean(
        (
          window as typeof window & {
            __GPD_GOOGLE_COMMAND_HANDLER_LOADED__?: boolean
          }
        ).__GPD_GOOGLE_COMMAND_HANDLER_LOADED__
      )
    })
  })
  const afterState = after?.result as
    | {
        hasGptk?: boolean
        hasCommandHost?: boolean
        hasCommandHandler?: boolean
      }
    | undefined
  return afterState
    ? Boolean(afterState.hasCommandHost && afterState.hasCommandHandler)
    : true
}

function contentScriptFilesForProvider(provider: PhotoProvider): string[] {
  const patterns = providerTabPatterns(provider)
  const manifest = chrome.runtime.getManifest()
  return (
    manifest.content_scripts
      ?.filter((script) =>
        script.matches?.some((match) => patterns.includes(match))
      )
      .flatMap((script) => script.js ?? []) ?? []
  )
}

async function ensureProviderBridge(
  tabId: number,
  provider: PhotoProvider
): Promise<boolean> {
  if (await pingProviderBridge(tabId)) {
    if (provider !== "google") return true
    return ensureGoogleMainWorldScripts(tabId)
  }

  const files = contentScriptFilesForProvider(provider)
  if (files.length === 0) return false

  try {
    for (const file of files) {
      await chrome.scripting.executeScript({
        target: {
          tabId,
          allFrames: getProviderOperations(provider).injectBridgeIntoAllFrames
        },
        files: [file]
      })
    }
    if (provider === "google") {
      await ensureGoogleMainWorldScripts(tabId)
    }
    return pingProviderBridge(tabId)
  } catch (error) {
    console.warn("[GPD] unable to inject provider bridge", error)
    return false
  }
}

async function getReachableMappedProviderTabId(
  senderTabId: number,
  provider: PhotoProvider = "google"
): Promise<number | null> {
  const mappedTabId = connectionSession.mappedProviderTabId(
    senderTabId,
    provider
  )
  if (mappedTabId === null) return null

  try {
    if (!(await ensureProviderBridge(mappedTabId, provider))) throw new Error()
    return mappedTabId
  } catch {
    connectionSession.forgetProviderTab(senderTabId)
    return null
  }
}

/**
 * Get the sender's tab ID. For content scripts, sender.tab is set.
 * For extension pages (tabs/app.html), sender.tab is undefined —
 * we resolve it from sender.url via chrome.tabs.query.
 */
async function getSenderTabId(
  sender: chrome.runtime.MessageSender
): Promise<number | null> {
  if (isSidePanelSender(sender)) return null
  if (sender.tab?.id !== undefined && sender.tab.id !== null) {
    return sender.tab.id
  }

  // Extension page: find tab by URL
  if (sender.url) {
    const tabs = await chrome.tabs.query({ url: sender.url })
    if (tabs.length > 0 && hasTabId(tabs[0])) return tabs[0].id
  }
  return null
}

function appMessage<T extends AppMessage>(message: T, clientId?: string): T {
  return clientId ? ({ ...message, clientId } as T) : message
}

function sendToAppContext(
  tabId: number | null,
  message: AppMessage,
  clientId?: string
): void {
  const targetedMessage = appMessage(message, clientId)
  if (tabId !== null) {
    Promise.resolve(chrome.tabs.sendMessage(tabId, targetedMessage)).catch(
      () => {
        if (clientId) {
          Promise.resolve(chrome.runtime.sendMessage(targetedMessage)).catch(
            () => {}
          )
        }
      }
    )
    return
  }
  if (clientId) {
    Promise.resolve(chrome.runtime.sendMessage(targetedMessage)).catch(() => {})
  }
}

async function getMappedProviderTabId(
  senderTabId: number | null,
  provider: PhotoProvider
): Promise<number | null> {
  if (senderTabId !== null) {
    return getReachableMappedProviderTabId(senderTabId, provider)
  }
  const providerTabId = connectionSession.mappedProviderTabId(null, provider)
  if (providerTabId === null) return null
  try {
    if (!(await ensureProviderBridge(providerTabId, provider))) {
      throw new Error()
    }
    return providerTabId
  } catch {
    connectionSession.forgetProviderTab(null)
    return null
  }
}

function rememberProviderTab(
  appTabId: number | null,
  providerTabId: number,
  provider: PhotoProvider
): void {
  connectionSession.remember(appTabId, providerTabId, provider)
}

async function openSidePanelForTab(tabId: number): Promise<boolean> {
  if (!sidePanelApi?.setOptions || !sidePanelApi.open) return false

  await sidePanelApi.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true
  })
  await sidePanelApi.open({ tabId })
  return true
}

async function handleActionClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!hasTabId(tab)) return
  connectionSession.setHostTab(tab.id)
  const opened = await openSidePanelForTab(tab.id)
  if (!opened) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/app.html") })
  }
}

chrome.action.onClicked.addListener((tab) => {
  handleActionClick(tab).catch((error) => {
    console.warn("[GPD] unable to open tab-scoped side panel", error)
  })
})

chrome.tabs.onActivated?.addListener((activeInfo) => {
  connectionSession.setHostTab(activeInfo.tabId)
  enableSidePanelForTab(activeInfo.tabId).catch((error) => {
    console.warn("[GPD] unable to enable activated tab side panel", error)
  })
})

chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (!tab.active && changeInfo.status !== "complete") return
  enableSidePanelForTab(tabId).catch((error) => {
    console.warn("[GPD] unable to enable updated tab side panel", error)
  })
})

enableActiveSidePanels()

async function openProviderInCurrentTab(
  provider: PhotoProvider,
  tab?: chrome.tabs.Tab,
  preferredTabId?: number | null,
  allowCreate = true
): Promise<{ tab: chrome.tabs.Tab; alreadyOpen: boolean } | null> {
  const seenTabIds = new Set<number>()

  async function tryOpenCandidate(
    targetTab: chrome.tabs.Tab | undefined
  ): Promise<{ tab: chrome.tabs.Tab; alreadyOpen: boolean } | null> {
    if (!targetTab || !hasTabId(targetTab) || seenTabIds.has(targetTab.id)) {
      return null
    }
    seenTabIds.add(targetTab.id)
    if (!canNavigateTabToProvider(targetTab)) return null
    const alreadyOpen = isProviderPhotosPage(targetTab, provider)
    if (alreadyOpen) {
      const focusedTab =
        (await chrome.tabs
          .update(targetTab.id, { active: true })
          .catch(() => undefined)) ?? targetTab
      return { tab: focusedTab, alreadyOpen }
    }
    try {
      const openedTab = await chrome.tabs.update(targetTab.id, {
        url: providerOpenUrlForTab(provider, targetTab),
        active: true
      })
      return { tab: openedTab, alreadyOpen }
    } catch {
      // Some Chrome-owned pages reject tab updates. Try another real tab in
      // the same window before falling back to create/failure behavior.
      return null
    }
  }

  const senderTabResult = await tryOpenCandidate(tab)
  if (senderTabResult) return senderTabResult

  if (preferredTabId !== undefined && preferredTabId !== null) {
    const preferredTab = await chrome.tabs
      .get(preferredTabId)
      .catch(() => undefined)
    const preferredResult = await tryOpenCandidate(preferredTab)
    if (preferredResult) return preferredResult
  }

  const existingProviderTabs = (
    await Promise.all(
      providerTabPatterns(provider).map((url) => chrome.tabs.query({ url }))
    )
  ).flat()
  for (const providerTab of existingProviderTabs) {
    const providerResult = await tryOpenCandidate(providerTab)
    if (providerResult) return providerResult
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  })
  const activeResult = await tryOpenCandidate(activeTab)
  if (activeResult) return activeResult

  for (const windowTab of await chrome.tabs.query({ currentWindow: true })) {
    const windowResult = await tryOpenCandidate(windowTab)
    if (windowResult) return windowResult
  }

  if (!allowCreate) return null
  const createdTab = await chrome.tabs.create({
    url: providerOpenUrl(provider),
    active: true
  })
  return { tab: createdTab, alreadyOpen: false }
}

function launchProviderError(
  provider: PhotoProvider,
  error: string
): LaunchProviderResult {
  return {
    success: false,
    provider,
    error
  }
}

// ============================================================
// Send a GPTK command to the Google Photos tab and await result
// ============================================================

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stopPendingCommandsForSidePanel(clientId?: string): void {
  connectionSession.stopClient(clientId)
}

async function collectIcloudMediaInFrame(args?: {
  limit?: number
}): Promise<GpdMediaItem[]> {
  function sleepInFrame(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function hashString(value: string): string {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
  }

  function imageSource(image: HTMLImageElement): string {
    return image.currentSrc || image.src || ""
  }

  function stableImageIdentity(source: string): string {
    try {
      const url = new URL(source, location.href)
      if (url.hostname.endsWith("icloud-content.com")) {
        return `${url.origin}${url.pathname}`
      }
      return url.href
    } catch {
      return source
    }
  }

  function elementLabel(element: Element): string {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      element.closest("[aria-label], [title]")?.getAttribute("aria-label") ||
      ""
    ).trim()
  }

  function thumbnailFor(image: HTMLImageElement, source: string): string {
    if (!source.startsWith("blob:")) return source
    try {
      const naturalWidth = image.naturalWidth || Math.round(image.width)
      const naturalHeight = image.naturalHeight || Math.round(image.height)
      const maxEdge = 64
      const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(naturalHeight * scale))
      const context = canvas.getContext("2d")
      if (!context) return source
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL("image/jpeg", 0.55)
    } catch {
      return source
    }
  }

  function tileIdentity(
    image: HTMLImageElement,
    scrollRoot?: HTMLElement
  ): string {
    const rect = image.getBoundingClientRect()
    const rootRect = scrollRoot?.getBoundingClientRect()
    const scrollTop = scrollRoot?.scrollTop ?? window.scrollY
    const scrollLeft = scrollRoot?.scrollLeft ?? window.scrollX
    const absoluteTop = rect.top - (rootRect?.top ?? 0) + scrollTop
    const absoluteLeft = rect.left - (rootRect?.left ?? 0) + scrollLeft
    const width = rect.width || image.naturalWidth || image.width
    const height = rect.height || image.naturalHeight || image.height

    if (width > 0 || height > 0) {
      return [
        Math.round(absoluteTop / 4),
        Math.round(absoluteLeft / 4),
        Math.round(width),
        Math.round(height)
      ].join(":")
    }

    return imageSource(image)
  }

  const route = location.href.toLowerCase()
  if (route.includes("recentlydeleted") || route.includes("/hidden")) return []

  function collectImages(root: Document | Element): HTMLImageElement[] {
    const images = Array.from(root.querySelectorAll("img"))
    for (const frame of Array.from(root.querySelectorAll("iframe"))) {
      try {
        if (frame.contentDocument) {
          images.push(...collectImages(frame.contentDocument))
        }
      } catch {
        // Cross-origin frames cannot be inspected; iCloud's app frame is same-origin.
      }
    }
    return images
  }

  const items: GpdMediaItem[] = []
  const seenItems = new Set<string>()
  const maxItems =
    typeof args?.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.floor(args.limit))
      : Number.POSITIVE_INFINITY

  async function waitForImages(root: Document | Element): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        collectImages(root).some((image) => {
          const source = imageSource(image)
          const width = image.naturalWidth || image.width
          const height = image.naturalHeight || image.height
          return source && width >= 40 && height >= 40
        })
      ) {
        return
      }
      await sleepInFrame(500)
    }
  }

  function collectRenderedImages(
    root: Document | Element,
    scrollRoot?: HTMLElement
  ): void {
    const images = collectImages(root).filter((image) => {
      const source = imageSource(image)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      return (
        source &&
        !/^data:image\/svg/i.test(source) &&
        width >= 40 &&
        height >= 40
      )
    })

    for (let index = 0; index < images.length; index++) {
      try {
        if (items.length >= maxItems) return
        const image = images[index]
        const source = imageSource(image)
        const identity =
          stableImageIdentity(source) || tileIdentity(image, scrollRoot)
        if (!identity || seenItems.has(identity)) continue
        seenItems.add(identity)
        const thumb = thumbnailFor(image, source)
        if (!thumb) continue
        const label = elementLabel(image)
        const mediaKey = `icloud-${hashString(identity)}`
        items.push({
          mediaKey,
          dedupKey: mediaKey,
          thumb,
          provider: "icloud",
          productUrl: location.href,
          timestamp: Date.now(),
          creationTimestamp: Date.now(),
          resWidth: Math.round(image.naturalWidth || image.width) || undefined,
          resHeight:
            Math.round(image.naturalHeight || image.height) || undefined,
          fileName: label || `iCloud Photo ${items.length + 1}`,
          takesUpSpace: null,
          isOriginalQuality: null
        })
      } catch {
        // Keep the scan moving if one virtualized thumbnail cannot be serialized.
      }
    }
  }

  function scrollableRoots(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return (
          element.scrollHeight > element.clientHeight + 100 &&
          element.clientHeight > 100 &&
          rect.width > 100 &&
          rect.height > 100
        )
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight)
  }

  const scrollRoot =
    document.querySelector<HTMLElement>(".grid-scroll") ??
    document.querySelector<HTMLElement>("[class*='grid-scroll']") ??
    scrollableRoots()[0]

  await waitForImages(scrollRoot ?? document)

  if (!scrollRoot) {
    collectRenderedImages(document)
    return items
  }

  const originalScrollTop = scrollRoot.scrollTop
  const step = Math.max(240, Math.floor(scrollRoot.clientHeight * 0.5))
  const maxPasses = Math.max(
    120,
    Math.min(2000, Math.ceil(scrollRoot.scrollHeight / step) + 20)
  )
  let previousScrollTop = -1
  let stagnantPasses = 0

  scrollRoot.scrollTop = 0
  await sleepInFrame(900)

  for (let pass = 0; pass < maxPasses; pass++) {
    const beforeCount = items.length
    collectRenderedImages(scrollRoot, scrollRoot)
    if (items.length === beforeCount) stagnantPasses++
    else stagnantPasses = 0

    const atBottom =
      scrollRoot.scrollTop + scrollRoot.clientHeight >=
      scrollRoot.scrollHeight - 4
    if (atBottom || stagnantPasses >= 12 || items.length >= maxItems) break

    previousScrollTop = scrollRoot.scrollTop
    scrollRoot.scrollTop = Math.min(
      scrollRoot.scrollHeight,
      scrollRoot.scrollTop + step
    )
    if (scrollRoot.scrollTop === previousScrollTop) break
    await sleepInFrame(450)
  }

  scrollRoot.scrollTop = originalScrollTop
  return items
}

async function sendIcloudDirectScan(
  providerTabId: number,
  appTabId: number,
  message: GptkCommandMessage
): Promise<void> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({
      tabId: providerTabId
    })
    const appFrameIds =
      frames
        ?.filter((frame) => frame.url.includes("/applications/photos"))
        .map((frame) => frame.frameId) ?? []
    const results = await chrome.scripting.executeScript({
      target:
        appFrameIds.length > 0
          ? { tabId: providerTabId, frameIds: appFrameIds }
          : { tabId: providerTabId, allFrames: true },
      func: collectIcloudMediaInFrame,
      args: [message.args as { limit?: number } | undefined]
    })
    const items =
      results
        .map((result) => result.result ?? [])
        .sort((a, b) => b.length - a.length)[0] ?? []
    chrome.tabs.sendMessage(appTabId, {
      app: APP_ID,
      action: "gptkProgress",
      command: message.command,
      requestId: message.requestId,
      itemsProcessed: items.length,
      message: `Collected ${items.length} loaded iCloud items from the page`
    } as GptkProgressMessage)
    chrome.tabs.sendMessage(appTabId, {
      app: APP_ID,
      action: "gptkResult",
      command: message.command,
      requestId: message.requestId,
      success: true,
      data: items
    } as GptkResultMessage)
  } catch (error) {
    chrome.tabs.sendMessage(appTabId, {
      app: APP_ID,
      action: "gptkResult",
      command: message.command,
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    } as GptkResultMessage)
  } finally {
    connectionSession.cancelCommand(message.requestId)
  }
}

async function sendGptkCommand(
  gpTabId: number,
  command: string,
  args?: unknown,
  provider: PhotoProvider = "google"
): Promise<unknown> {
  const requestId = generateRequestId()

  const message: GptkCommandMessage = {
    app: APP_ID,
    action: "gptkCommand",
    command,
    requestId,
    args,
    provider
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      connectionSession.cancelCommand(requestId)
      reject(
        `Timed out waiting for ${providerName(provider)} to respond. Please reload the tab and try again.`
      )
    }, GPTK_COMMAND_TIMEOUT_MS)
    connectionSession.startCommand(requestId, {
      resolve: (data) => {
        clearTimeout(timeoutId)
        resolve(data)
      },
      reject: (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
      appTabId: null
    })
    const delivery =
      provider === "icloud"
        ? chrome.scripting.executeScript({
            target: { tabId: gpTabId, allFrames: true },
            world: "MAIN",
            func: (commandMessage: GptkCommandMessage) => {
              window.postMessage(commandMessage, "*")
            },
            args: [message]
          })
        : chrome.tabs.sendMessage(gpTabId, message)

    delivery.catch(() => {
      clearTimeout(timeoutId)
      connectionSession.cancelCommand(requestId)
      reject(
        `Unable to connect to ${providerName(provider)} tab. Please reload the tab and try again.`
      )
    })
  })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "gpd-side-panel") return

  let clientId: string | undefined
  port.onMessage.addListener((message: unknown) => {
    const payload = message as {
      app?: string
      action?: string
      clientId?: string
      activeTabId?: number
    }
    if (payload?.app !== APP_ID || payload.action !== "sidePanel.ready") return
    clientId = payload.clientId
    if (typeof payload.activeTabId === "number") {
      connectionSession.setHostTab(payload.activeTabId)
    }
  })
  port.onDisconnect.addListener(() => {
    stopPendingCommandsForSidePanel(clientId)
  })
})

// ============================================================
// Message handler
// ============================================================

chrome.runtime.onMessage.addListener(
  (
    message: AppMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (message?.app !== APP_ID) return

    switch (message.action) {
      case "launchApp":
        handleLaunchApp(sender)
        break
      case "launchProvider":
        handleLaunchProvider(
          message.provider ?? "google",
          sender,
          message.hostTabId
        )
          .then(sendResponse)
          .catch((error) => {
            sendResponse(
              launchProviderError(
                message.provider ?? "google",
                error instanceof Error ? error.message : String(error)
              )
            )
          })
        return true
      case "healthCheck":
        handleHealthCheck(message, sender)
        break
      case "gptkCommand":
        handleGptkCommand(message as GptkCommandMessage, sender)
        break
      case "gptkResult":
        handleGptkResult(message as GptkResultMessage, sender)
        break
      case "gptkProgress":
        handleGptkProgress(message as GptkProgressMessage, sender)
        break
    }
  }
)

// ============================================================
// Handlers
// ============================================================

async function handleLaunchApp(
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const appTab = await chrome.tabs.create({
    url: chrome.runtime.getURL("tabs/app.html")
  })
  if (
    sender.tab?.id !== undefined &&
    sender.tab.id !== null &&
    hasTabId(appTab)
  ) {
    connectionSession.linkTabs(sender.tab.id, appTab.id)
  }
}

async function handleLaunchProvider(
  provider: PhotoProvider,
  sender: chrome.runtime.MessageSender,
  hostTabId?: number
): Promise<LaunchProviderResult> {
  const fromSidePanel = isSidePanelSender(sender)
  const preferredTabId =
    typeof hostTabId === "number" ? hostTabId : connectionSession.hostTabId
  const providerOpenResult = await openProviderInCurrentTab(
    provider,
    fromSidePanel ? undefined : sender.tab,
    preferredTabId,
    !fromSidePanel
  )
  const providerTab = providerOpenResult?.tab
  if (!providerTab || !hasTabId(providerTab)) {
    return launchProviderError(
      provider,
      `Could not open ${providerName(provider)} in this window. Open a normal web tab, then click the extension again.`
    )
  }

  rememberProviderTab(null, providerTab.id, provider)
  connectionSession.setHostTab(providerTab.id)
  try {
    await openSidePanelForTab(providerTab.id)
  } catch (error) {
    console.warn("[GPD] unable to open side panel", error)
  }
  return {
    success: true,
    provider,
    tabId: providerTab.id,
    alreadyOpen: providerOpenResult.alreadyOpen
  }
}

async function handleHealthCheck(
  message: AppMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const provider =
    message.action === "healthCheck" ? message.provider ?? "google" : "google"
  const senderTabId = await getSenderTabId(sender)
  const clientId = message.clientId

  const providerTab = await findProviderTab(
    provider,
    connectionSession.hostTabId
  )
  if (!providerTab || !hasTabId(providerTab)) {
    sendToAppContext(
      senderTabId,
      {
        app: APP_ID,
        action: "healthCheck.result",
        provider,
        success: false,
        hasGptk: false
      },
      clientId
    )
    return
  }

  rememberProviderTab(senderTabId, providerTab.id, provider)

  try {
    let result = await sendGptkCommand(
      providerTab.id,
      "healthCheck",
      undefined,
      provider
    )
    let r = result as { hasGptk: boolean; accountEmail?: string }
    if (provider === "google" && !r.hasGptk) {
      const injected = await ensureGoogleMainWorldScripts(providerTab.id)
      if (injected) {
        result = await sendGptkCommand(
          providerTab.id,
          "healthCheck",
          undefined,
          provider
        )
        r = result as { hasGptk: boolean; accountEmail?: string }
      }
    }
    sendToAppContext(
      senderTabId,
      {
        app: APP_ID,
        action: "healthCheck.result",
        provider,
        success: Boolean(r.hasGptk),
        hasGptk: r.hasGptk,
        accountEmail: r.accountEmail
      },
      clientId
    )
  } catch (error) {
    sendToAppContext(
      senderTabId,
      {
        app: APP_ID,
        action: "healthCheck.result",
        provider,
        success: false,
        hasGptk: false,
        error: error instanceof Error ? error.message : String(error)
      },
      clientId
    )
  }
}

async function handleGptkCommand(
  message: GptkCommandMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const senderTabId = await getSenderTabId(sender)
  const provider = message.provider ?? "google"

  let providerTabId = await getMappedProviderTabId(senderTabId, provider)
  if (providerTabId === null) {
    const providerTab = await findProviderTab(
      provider,
      connectionSession.hostTabId
    )
    if (!providerTab || !hasTabId(providerTab)) {
      sendToAppContext(
        senderTabId,
        {
          app: APP_ID,
          action: "gptkResult",
          command: message.command,
          requestId: message.requestId,
          success: false,
          error: `${providerName(provider)} tab not found. Please open ${providerOpenUrl(provider)}.`
        } as GptkResultMessage,
        message.clientId
      )
      return
    }
    providerTabId = providerTab.id
    rememberProviderTab(senderTabId, providerTabId, provider)
  }

  connectionSession.startCommand(message.requestId, {
    resolve: () => {},
    reject: () => {},
    appTabId: senderTabId,
    appClientId: message.clientId
  })

  if (
    provider === "icloud" &&
    (message.command === "getAllMediaItems" ||
      message.command === "trashItems" ||
      message.command === "restoreItems")
  ) {
    await chrome.tabs.update(providerTabId, { active: true }).catch(() => {})
    await sleep(1500)
  }

  if (provider === "icloud") {
    const frames = await chrome.webNavigation
      .getAllFrames({ tabId: providerTabId })
      .catch(() => [])
    const appFrameIds =
      frames
        ?.filter((frame) => frame.url.includes("/applications/photos"))
        .map((frame) => frame.frameId) ?? []
    chrome.scripting
      .executeScript({
        target:
          appFrameIds.length > 0
            ? { tabId: providerTabId, frameIds: appFrameIds }
            : { tabId: providerTabId, allFrames: true },
        world: "MAIN",
        func: (commandMessage: GptkCommandMessage) => {
          window.postMessage(commandMessage, "*")
        },
        args: [message]
      })
      .catch(() => {
        sendToAppContext(
          senderTabId,
          {
            app: APP_ID,
            action: "gptkResult",
            command: message.command,
            requestId: message.requestId,
            success: false,
            error: `Unable to connect to ${providerName(provider)} frames. Please reload the tab and try again.`
          } as GptkResultMessage,
          message.clientId
        )
        connectionSession.cancelCommand(message.requestId)
      })
    return
  }

  chrome.tabs.sendMessage(providerTabId, message).catch(() => {
    sendToAppContext(
      senderTabId,
      {
        app: APP_ID,
        action: "gptkResult",
        command: message.command,
        requestId: message.requestId,
        success: false,
        error: `Unable to connect to ${providerName(provider)} tab. Please reload the tab and try again.`
      } as GptkResultMessage,
      message.clientId
    )
    connectionSession.cancelCommand(message.requestId)
  })
}

function handleGptkResult(
  message: GptkResultMessage,
  _sender: chrome.runtime.MessageSender
): void {
  const pending = connectionSession.finishCommand(message.requestId)
  if (!pending) return

  // Relay result to the app tab
  sendToAppContext(pending.appTabId, message, pending.appClientId)

  // Resolve/reject the promise if anyone is awaiting
  if (message.success) {
    pending.resolve(message.data)
  } else {
    pending.reject(message.error || "Unknown error")
  }

}

function handleGptkProgress(
  message: GptkProgressMessage,
  _sender: chrome.runtime.MessageSender
): void {
  const pending = connectionSession.pendingCommand(message.requestId)
  if (!pending) return

  // Relay progress to the app tab
  sendToAppContext(pending.appTabId, message, pending.appClientId)
}

// ============================================================
// Tab cleanup
// ============================================================

chrome.tabs.onRemoved.addListener((tabId) => {
  const mappedTabId = connectionSession.removeTab(tabId)
  if (mappedTabId !== null) {
    // If a GP tab closed, notify the app tab
    chrome.tabs
      .sendMessage(mappedTabId, {
        app: APP_ID,
        action: "gptkLog",
        level: "error",
        message: "Connected photo source tab was closed."
      })
      .catch(() => {
        // App tab may also be gone
      })
  }
})

console.log("GPD: Service worker loaded")
