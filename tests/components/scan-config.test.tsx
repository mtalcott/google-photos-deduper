/**
 * Component tests for ScanConfig — smart-mode time window (PR #121).
 *
 * Covers the `formatWindow` label formatter (s / m / h / d / w boundaries) and
 * the time-window ToggleButtonGroup, which is only shown in smart mode and
 * drives `onSettingsChange({ smartWindowSec })`.
 */
import { ThemeProvider } from "@mui/material/styles"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScanConfig } from "../../components/ScanConfig"
import { createScanCheckpoint } from "../../lib/scan-checkpoint"
import theme from "../../lib/theme"
import type { Entitlement } from "../../lib/entitlement"
import type { ScanSettings } from "../../lib/types"

// ============================================================
// Helpers
// ============================================================

function renderConfig(
  settings: Partial<ScanSettings> = {},
  options: {
    compact?: boolean
    hasGptk?: boolean
    entitlement?: Entitlement | null
  } = {}
) {
  const onSettingsChange = vi.fn()
  const onStartScan = vi.fn()
  const onUpgrade = vi.fn()
  const full: ScanSettings = {
    similarityThreshold: 0.99,
    scanMode: "smart",
    smartWindowSec: 1,
    ...settings
  }
  render(
    <ThemeProvider theme={theme}>
      <ScanConfig
        settings={full}
        onSettingsChange={onSettingsChange}
        onStartScan={onStartScan}
        onUpgrade={onUpgrade}
        onClearCache={vi.fn()}
        onRebuildCache={vi.fn()}
        onExportCacheDiagnostics={vi.fn()}
        hasGptk={options.hasGptk ?? true}
        cacheEntryCount={12}
        albums={[
          {
            mediaKey: "album-1",
            title: "Tiny test album",
            itemCount: 3,
            isShared: false
          },
          {
            mediaKey: "album-2",
            title: "Shared album",
            itemCount: 12,
            isShared: true
          }
        ]}
        entitlement={options.entitlement}
        compact={options.compact}
      />
    </ThemeProvider>
  )
  return { onSettingsChange, onStartScan, onUpgrade }
}

// ============================================================
// formatWindow — label formatting via the rendered "Time window:" line
// ============================================================

describe("ScanConfig — time window label (formatWindow)", () => {
  // [smartWindowSec, expected label suffix]
  const cases: [number, string][] = [
    [1, "1s"],
    [59, "59s"],
    [60, "1m"],
    [120, "2m"],
    [3600, "1h"],
    [7200, "2h"],
    [86400, "1d"],
    [172800, "2d"],
    [604800, "1w"],
    [1209600, "2w"]
  ]

  for (const [sec, label] of cases) {
    it(`formats ${sec}s as "${label}"`, () => {
      renderConfig({ smartWindowSec: sec })
      expect(screen.getByText(/Time window:/)).toHaveTextContent(
        `Time window: ${label}`
      )
    })
  }

  it("falls back to 1s when smartWindowSec is undefined", () => {
    renderConfig({ smartWindowSec: undefined })
    expect(screen.getByText(/Time window:/)).toHaveTextContent(
      "Time window: 1s"
    )
  })
})

// ============================================================
// Time window toggle — only shown in smart mode, fires onSettingsChange
// ============================================================

describe("ScanConfig — time window toggle", () => {
  it("emits the selected window in seconds when a button is clicked", () => {
    // smartWindowSec=1 → the "Time window:" label reads "1s", so the "1m"
    // text uniquely identifies the toggle button (not the label).
    const { onSettingsChange } = renderConfig({ smartWindowSec: 1 })
    fireEvent.click(screen.getByText("1m"))
    expect(onSettingsChange).toHaveBeenCalledWith({ smartWindowSec: 60 })
  })

  it("maps the 1w button to 604800 seconds", () => {
    const { onSettingsChange } = renderConfig({ smartWindowSec: 1 })
    fireEvent.click(screen.getByText("1w"))
    expect(onSettingsChange).toHaveBeenCalledWith({ smartWindowSec: 604800 })
  })

  it("does not render the time window control in full-scan mode", () => {
    renderConfig({ scanMode: "full" })
    expect(screen.queryByText(/Time window:/)).not.toBeInTheDocument()
  })
})

describe("ScanConfig — taken date range", () => {
  it("emits date range updates from the date inputs", () => {
    const { onSettingsChange } = renderConfig()

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2024-01-01" }
    })
    expect(onSettingsChange).toHaveBeenCalledWith({
      dateRange: { from: "2024-01-01" }
    })

    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2024-12-31" }
    })
    expect(onSettingsChange).toHaveBeenCalledWith({
      dateRange: { to: "2024-12-31" }
    })
  })

  it("labels the primary button as a date range scan when scoped", () => {
    renderConfig({ dateRange: { from: "2024-01-01", to: "2024-12-31" } })
    expect(
      screen.getByRole("button", { name: /Check this date range/i })
    ).toBeInTheDocument()
  })

  it("blocks scanning when the date range is inverted", () => {
    const { onStartScan } = renderConfig({
      dateRange: { from: "2025-01-01", to: "2024-01-01" }
    })

    const button = screen.getByRole("button", {
      name: /Check this date range/i
    })
    expect(button).toBeDisabled()
    expect(screen.getByText(/start date must be before/i)).toBeInTheDocument()

    fireEvent.click(button)
    expect(onStartScan).not.toHaveBeenCalled()
  })
})

describe("ScanConfig — large-library scan warning", () => {
  it("warns before an unscoped full-library comparison", () => {
    renderConfig({ scanMode: "full" })

    expect(
      screen.getByText(/Full-library comparison can be slow and memory-heavy/i)
    ).toBeInTheDocument()
  })

  it("does not warn when full scan is scoped to a date range", () => {
    renderConfig({
      scanMode: "full",
      dateRange: { from: "2024-01-01", to: "2024-12-31" }
    })

    expect(
      screen.queryByText(
        /Full-library comparison can be slow and memory-heavy/i
      )
    ).not.toBeInTheDocument()
  })

  it("does not warn when full scan is scoped to an album", () => {
    renderConfig({
      scanMode: "full",
      albumScope: {
        mediaKey: "album-1",
        title: "Tiny test album",
        itemCount: 3
      }
    })

    expect(
      screen.queryByText(
        /Full-library comparison can be slow and memory-heavy/i
      )
    ).not.toBeInTheDocument()
  })
})

describe("ScanConfig — similarity threshold guidance", () => {
  it("explains that lower thresholds catch more reuploads", () => {
    renderConfig({ scanMode: "full", similarityThreshold: 0.95 })
    fireEvent.click(screen.getByRole("button", { name: /More options/i }))

    expect(
      screen.getByText(
        /Lower values catch more reuploads, screenshots, and edited copies/i
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/Loose/i)).toBeInTheDocument()
    expect(screen.getByText(/Balanced/i)).toBeInTheDocument()
    expect(screen.getByText(/Near exact/i)).toBeInTheDocument()
    expect(screen.getByText("Exact")).toBeInTheDocument()
  })
})

describe("ScanConfig — album scope", () => {
  it("shows album count and emits the selected album scope", () => {
    const { onSettingsChange } = renderConfig()

    fireEvent.click(screen.getByRole("button", { name: /More options/i }))
    expect(screen.getByText(/2 albums available/i)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Library area/i }))
    fireEvent.click(screen.getByRole("option", { name: /Tiny test album/i }))

    expect(onSettingsChange).toHaveBeenCalledWith({
      albumScope: {
        mediaKey: "album-1",
        title: "Tiny test album",
        itemCount: 3,
        isShared: false
      }
    })
  })

  it("labels the primary button as an album scan when album-scoped", () => {
    renderConfig({
      albumScope: {
        mediaKey: "album-1",
        title: "Tiny test album",
        itemCount: 3
      }
    })

    expect(
      screen.getByRole("button", { name: /Check this album/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Only checking Tiny test album/i)
    ).toBeInTheDocument()
  })
})

describe("ScanConfig — photo source", () => {
  it("switches to iCloud and explains scan-only support", () => {
    const { onSettingsChange } = renderConfig()

    fireEvent.click(screen.getByRole("button", { name: /More options/i }))
    fireEvent.click(screen.getByRole("button", { name: /iCloud Photos/i }))

    expect(onSettingsChange).toHaveBeenCalledWith({
      sourceProvider: "icloud",
      albumScope: undefined
    })
  })

  it("uses shared scan controls for iCloud and hides Google album controls", () => {
    renderConfig({ sourceProvider: "icloud" })

    expect(
      screen.getByRole("button", { name: /Check entire library/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/Recently Deleted/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Free users can review scoped Smart scans/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /More options/i }))
    expect(
      screen.queryByRole("combobox", { name: /Library area/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/iCloud test batch size/i)).not.toBeInTheDocument()
  })

  it("uses the same compact scope visual pattern for non-Google providers", () => {
    renderConfig(
      { sourceProvider: "icloud" },
      { compact: true, hasGptk: false }
    )

    expect(screen.getByLabelText(/Library area/i)).toHaveValue(
      "iCloud Photos library"
    )
    expect(
      screen.getByRole("button", { name: /Check entire library/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Reads the connected iCloud Photos tab/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Choose photo source/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Leave iCloud Photos open/i)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Retry connection/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/iCloud Photos is not connected/i)
    ).not.toBeInTheDocument()

    cleanup()
    renderConfig(
      { sourceProvider: "amazon" },
      { compact: true, hasGptk: false }
    )

    expect(screen.getByLabelText(/Library area/i)).toHaveValue(
      "Amazon Photos library"
    )
    expect(
      screen.getByText(/Reads the connected Amazon Photos tab/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Check entire library/i })
    ).toBeInTheDocument()
  })

  it("ignores saved iCloud test batches for Free users", () => {
    const { onStartScan, onUpgrade } = renderConfig({
      sourceProvider: "icloud",
      icloudBatchLimit: 50
    })

    const startButton = screen.getByRole("button", {
      name: /Check entire library/i
    })
    expect(startButton).toBeInTheDocument()
    expect(screen.queryByText(/Test batch is on/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/Free iCloud scans need a date range before scanning/i)
    ).toBeInTheDocument()

    fireEvent.click(startButton)
    expect(onStartScan).not.toHaveBeenCalled()
    expect(onUpgrade).toHaveBeenCalledWith(
      expect.stringMatching(/Free iCloud scans need a date range/i)
    )
  })

  it("labels iCloud capped scans as test batches for paid users", () => {
    renderConfig(
      { sourceProvider: "icloud", icloudBatchLimit: 50 },
      {
        entitlement: {
          planId: "cleanup_pass",
          active: true,
          source: "signed_token"
        }
      }
    )

    expect(
      screen.getByRole("button", { name: /Check 50 item test batch/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/Test batch is on/i)).toBeInTheDocument()
  })

  it("switches to Amazon Photos and uses shared scan controls", () => {
    const { onSettingsChange } = renderConfig()

    fireEvent.click(screen.getByRole("button", { name: /Amazon Photos/i }))

    expect(onSettingsChange).toHaveBeenCalledWith({
      sourceProvider: "amazon",
      albumScope: undefined
    })

    cleanup()
    renderConfig({ sourceProvider: "amazon" })
    expect(
      screen.getByRole("link", { name: /Open Amazon Photos/i })
    ).toHaveAttribute("href", "https://www.amazon.com/photos?sf=1")
    expect(
      screen.getByRole("button", { name: /Check entire library/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Free and paid limits match the Google Photos workflow/i)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /More options/i }))
    expect(
      screen.queryByRole("combobox", { name: /Library area/i })
    ).not.toBeInTheDocument()
  })
})

describe("ScanConfig — embedding cache controls", () => {
  it("shows cache size and emits cache actions", () => {
    const onClearCache = vi.fn()
    const onRebuildCache = vi.fn()
    const onExportCacheDiagnostics = vi.fn()
    const full: ScanSettings = {
      similarityThreshold: 0.99,
      scanMode: "smart",
      smartWindowSec: 1
    }

    render(
      <ThemeProvider theme={theme}>
        <ScanConfig
          settings={full}
          onSettingsChange={vi.fn()}
          onStartScan={vi.fn()}
          onClearCache={onClearCache}
          onRebuildCache={onRebuildCache}
          onExportCacheDiagnostics={onExportCacheDiagnostics}
          hasGptk={true}
          cacheEntryCount={1234}
        />
      </ThemeProvider>
    )

    expect(screen.getByText(/1,234 cached embeddings/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /More options/i }))
    fireEvent.click(screen.getByRole("button", { name: /Clear Cache/i }))
    fireEvent.click(screen.getByRole("button", { name: /Rebuild Cache/i }))
    fireEvent.click(screen.getByRole("button", { name: /Export Diagnostics/i }))
    expect(onClearCache).toHaveBeenCalledOnce()
    expect(onRebuildCache).toHaveBeenCalledOnce()
    expect(onExportCacheDiagnostics).toHaveBeenCalledOnce()
  })
})

describe("ScanConfig — interrupted scan resume", () => {
  it("shows the resumable checkpoint and emits resume/dismiss actions", () => {
    const onResumeScan = vi.fn()
    const onDismissResume = vi.fn()
    const full: ScanSettings = {
      similarityThreshold: 0.99,
      scanMode: "smart",
      smartWindowSec: 1
    }
    const checkpoint = createScanCheckpoint({
      id: "req-1",
      settings: {
        ...full,
        dateRange: { from: "2024-01-01", to: "2024-12-31" }
      }
    })

    render(
      <ThemeProvider theme={theme}>
        <ScanConfig
          settings={full}
          onSettingsChange={vi.fn()}
          onStartScan={vi.fn()}
          onResumeScan={onResumeScan}
          onDismissResume={onDismissResume}
          onClearCache={vi.fn()}
          onRebuildCache={vi.fn()}
          onExportCacheDiagnostics={vi.fn()}
          hasGptk={true}
          cacheEntryCount={12}
          resumeCheckpoint={{
            ...checkpoint,
            status: "interrupted",
            phase: "computing_embeddings"
          }}
        />
      </ThemeProvider>
    )

    expect(screen.getByText(/Previous smart scan/i)).toHaveTextContent(
      "2024-01-01 to 2024-12-31"
    )
    expect(
      screen.getByText(/completed work will be reused/i)
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: /Continue previous scan/i })
    )
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }))
    expect(onResumeScan).toHaveBeenCalledOnce()
    expect(onDismissResume).toHaveBeenCalledOnce()
  })
})
