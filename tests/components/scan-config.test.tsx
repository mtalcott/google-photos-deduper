/**
 * Component tests for ScanConfig — smart-mode time window (PR #121).
 *
 * Covers the `formatWindow` label formatter (s / m / h / d / w boundaries) and
 * the time-window ToggleButtonGroup, which is only shown in smart mode and
 * drives `onSettingsChange({ smartWindowSec })`.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { ScanConfig } from "../../components/ScanConfig"
import type { ScanSettings } from "../../lib/types"

// ============================================================
// Helpers
// ============================================================

const theme = createTheme()

function renderConfig(settings: Partial<ScanSettings> = {}) {
  const onSettingsChange = vi.fn()
  const full: ScanSettings = {
    similarityThreshold: 0.99,
    scanMode: "smart",
    smartWindowSec: 1,
    ...settings,
  }
  render(
    <ThemeProvider theme={theme}>
      <ScanConfig
        settings={full}
        onSettingsChange={onSettingsChange}
        onStartScan={vi.fn()}
        hasGptk={true}
      />
    </ThemeProvider>
  )
  return { onSettingsChange }
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
    [1209600, "2w"],
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
    expect(screen.getByText(/Time window:/)).toHaveTextContent("Time window: 1s")
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

// ============================================================
// Album Selection checkbox
// ============================================================

describe("ScanConfig — album selection", () => {
  it("clears albumMediaKeys when Only from specific Album(s) is unchecked", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage: vi.fn()
      }
    })

    const { onSettingsChange } = renderConfig({ 
      onlyFromAlbums: true,
      albumMediaKeys: ["album1", "album2"]
    })
    
    const checkbox = screen.getByRole("checkbox", { hidden: true })
    fireEvent.click(checkbox)
    
    expect(onSettingsChange).toHaveBeenCalledWith({
      onlyFromAlbums: false,
      albumMediaKeys: []
    })
  })
})
