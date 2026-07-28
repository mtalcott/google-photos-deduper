import type { PhotoProvider } from "./types"

export interface PendingProviderCommand {
  resolve: (data: unknown) => void
  reject: (error: string) => void
  appTabId: number | null
  appClientId?: string
}

export class ProviderConnectionSession {
  private readonly tabMap = new Map<number, number>()
  private readonly providerByTab = new Map<number, PhotoProvider>()
  private readonly pendingCommands = new Map<string, PendingProviderCommand>()
  private sidePanelHost: number | null = null
  private sidePanelProviderTab: number | null = null
  private sidePanelProvider: PhotoProvider = "google"

  get hostTabId(): number | null {
    return this.sidePanelHost
  }

  setHostTab(tabId: number | null): void {
    this.sidePanelHost = tabId
  }

  linkTabs(firstTabId: number, secondTabId: number): void {
    this.tabMap.set(firstTabId, secondTabId)
    this.tabMap.set(secondTabId, firstTabId)
  }

  remember(
    appTabId: number | null,
    providerTabId: number,
    provider: PhotoProvider
  ): void {
    if (appTabId === null) {
      this.sidePanelProviderTab = providerTabId
      this.sidePanelProvider = provider
      return
    }
    this.linkTabs(appTabId, providerTabId)
    this.providerByTab.set(appTabId, provider)
    this.providerByTab.set(providerTabId, provider)
  }

  mappedProviderTabId(
    appTabId: number | null,
    provider: PhotoProvider
  ): number | null {
    if (appTabId === null) {
      return this.sidePanelProvider === provider
        ? this.sidePanelProviderTab
        : null
    }

    const providerTabId = this.tabMap.get(appTabId)
    if (
      providerTabId === undefined ||
      providerTabId === appTabId ||
      this.providerByTab.get(appTabId) !== provider
    ) {
      this.forgetPair(appTabId)
      return null
    }
    return providerTabId
  }

  forgetProviderTab(appTabId: number | null): void {
    if (appTabId === null) {
      this.sidePanelProviderTab = null
      return
    }
    this.forgetPair(appTabId)
  }

  startCommand(requestId: string, command: PendingProviderCommand): void {
    this.pendingCommands.set(requestId, command)
  }

  pendingCommand(requestId: string): PendingProviderCommand | undefined {
    return this.pendingCommands.get(requestId)
  }

  finishCommand(requestId: string): PendingProviderCommand | undefined {
    const command = this.pendingCommands.get(requestId)
    this.pendingCommands.delete(requestId)
    return command
  }

  cancelCommand(requestId: string, error?: string): void {
    const command = this.finishCommand(requestId)
    if (command && error) command.reject(error)
  }

  stopClient(clientId?: string): void {
    if (!clientId) return
    for (const [requestId, command] of this.pendingCommands) {
      if (command.appClientId !== clientId) continue
      this.pendingCommands.delete(requestId)
      command.reject("Side panel closed.")
    }
    this.sidePanelProviderTab = null
    this.sidePanelHost = null
  }

  removeTab(tabId: number): number | null {
    if (this.sidePanelHost === tabId) this.sidePanelHost = null
    if (this.sidePanelProviderTab === tabId) this.sidePanelProviderTab = null

    const mappedTabId = this.tabMap.get(tabId) ?? null
    this.forgetPair(tabId)

    for (const [requestId, command] of this.pendingCommands) {
      if (command.appTabId === tabId) this.pendingCommands.delete(requestId)
    }
    return mappedTabId
  }

  private forgetPair(tabId: number): void {
    const mappedTabId = this.tabMap.get(tabId)
    this.tabMap.delete(tabId)
    this.providerByTab.delete(tabId)
    if (mappedTabId === undefined) return
    this.tabMap.delete(mappedTabId)
    this.providerByTab.delete(mappedTabId)
  }
}
