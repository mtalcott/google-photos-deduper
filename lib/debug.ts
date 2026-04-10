// Debug logging utility.
// Enable at runtime in the extension console:
//   localStorage.setItem("gpd:debug", "1"); location.reload()
// Disable:
//   localStorage.removeItem("gpd:debug"); location.reload()
//
// Or enable for a single session without reload:
//   window.__gpdDebug = true

type LogLevel = "log" | "warn" | "error"

function isEnabled(): boolean {
  try {
    return !!(localStorage.getItem("gpd:debug") || (window as any).__gpdDebug)
  } catch {
    return false
  }
}

function dbg(level: LogLevel, tag: string, ...args: unknown[]): void {
  if (!isEnabled()) return
  console[level](`[GPD:${tag}]`, ...args)
}

export const debug = {
  log: (tag: string, ...args: unknown[]) => dbg("log", tag, ...args),
  warn: (tag: string, ...args: unknown[]) => dbg("warn", tag, ...args),
  error: (tag: string, ...args: unknown[]) => dbg("error", tag, ...args),
}
