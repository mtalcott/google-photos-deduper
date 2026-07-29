/**
 * Component tests for ScanProgress.
 *
 * Covers:
 * - Phase label for each ScanPhase value
 * - Step number display
 * - Progress bar mode (determinate vs. indeterminate)
 * - Item counts in caption text
 * - Pause button visibility and callback
 */
import { ThemeProvider } from "@mui/material/styles"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScanProgress } from "../../components/ScanProgress"
import theme from "../../lib/theme"
import type { ScanPhase } from "../../lib/types"

interface Props {
  phase?: ScanPhase
  itemsProcessed?: number
  totalEstimate?: number
  message?: string
  onPause?: (() => void) | undefined
  idleWarningMs?: number
}

function renderScanProgress(props: Props = {}) {
  const defaults: Required<Props> = {
    phase: "fetching",
    itemsProcessed: 0,
    totalEstimate: 0,
    message: "",
    onPause: undefined,
    idleWarningMs: 120_000
  }
  const merged = { ...defaults, ...props }
  return render(
    <ThemeProvider theme={theme}>
      <ScanProgress {...merged} />
    </ThemeProvider>
  )
}

// ============================================================
// Tests
// ============================================================

describe("ScanProgress", () => {
  describe("phase labels", () => {
    const cases: [ScanPhase, string, number][] = [
      ["fetching", "Reading your library", 1],
      ["downloading_thumbnails", "Loading previews", 2],
      ["computing_embeddings", "Comparing photos and videos", 3],
      ["detecting_duplicates", "Preparing review sets", 4],
      ["complete", "Complete", 4]
    ]

    it.each(cases)(
      "phase '%s' shows label '%s' (step %i)",
      (phase, label, step) => {
        renderScanProgress({ phase })
        expect(screen.getByText(label)).toBeInTheDocument()
        expect(screen.getByText(`Step ${step} of 4`)).toBeInTheDocument()
      }
    )
  })

  describe("progress display", () => {
    it("shows indeterminate progress bar when totalEstimate is 0", () => {
      renderScanProgress({ itemsProcessed: 0, totalEstimate: 0 })
      // Indeterminate: no percentage text shown
      expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument()
    })

    it("shows determinate progress bar when totalEstimate > 0", () => {
      renderScanProgress({ itemsProcessed: 500, totalEstimate: 1000 })
      // ScanProgress renders `{progress}%` text when isDeterminate is true
      expect(screen.getByText("50%")).toBeInTheDocument()
    })

    it("shows processed count only when totalEstimate is 0", () => {
      renderScanProgress({ itemsProcessed: 123, totalEstimate: 0 })
      expect(screen.getByText("123", { exact: false })).toBeInTheDocument()
      expect(
        screen.getByText(/You can leave this tab open/i)
      ).toBeInTheDocument()
    })

    it("shows processed / total when totalEstimate > 0", () => {
      renderScanProgress({ itemsProcessed: 300, totalEstimate: 1000 })
      expect(screen.getByText(/300 of 1,000 checked/)).toBeInTheDocument()
    })

    it("formats large numbers with locale separators", () => {
      renderScanProgress({ itemsProcessed: 12345, totalEstimate: 50000 })
      expect(
        screen.getByText(/12,345 of 50,000 checked/)
      ).toBeInTheDocument()
    })
  })

  describe("pause button", () => {
    it("does not render Pause Scan button when onPause is not provided", () => {
      renderScanProgress({ onPause: undefined })
      expect(
        screen.queryByRole("button", { name: /pause scan/i })
      ).not.toBeInTheDocument()
    })

    it("renders Pause Scan button when onPause is provided", () => {
      renderScanProgress({ onPause: vi.fn() })
      expect(
        screen.getByRole("button", { name: /pause scan/i })
      ).toBeInTheDocument()
    })

    it("calls onPause when Pause Scan button is clicked", () => {
      const onPause = vi.fn()
      renderScanProgress({ onPause })
      fireEvent.click(screen.getByRole("button", { name: /pause scan/i }))
      expect(onPause).toHaveBeenCalledOnce()
    })
  })

  describe("stuck scan warning", () => {
    it("shows a warning when progress has not changed for the idle threshold", () => {
      vi.useFakeTimers()
      try {
        renderScanProgress({
          itemsProcessed: 10,
          totalEstimate: 100,
          idleWarningMs: 5_000
        })
        expect(screen.queryByText(/No scan progress/i)).not.toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(5_000)
        })

        expect(screen.getByText(/No scan progress/i)).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it("resets the stuck warning when progress changes", () => {
      vi.useFakeTimers()
      try {
        const { rerender } = render(
          <ThemeProvider theme={theme}>
            <ScanProgress
              phase="computing_embeddings"
              itemsProcessed={10}
              totalEstimate={100}
              message="computing_embeddings: 10/100"
              idleWarningMs={5_000}
            />
          </ThemeProvider>
        )

        act(() => {
          vi.advanceTimersByTime(5_000)
        })
        expect(screen.getByText(/No scan progress/i)).toBeInTheDocument()

        rerender(
          <ThemeProvider theme={theme}>
            <ScanProgress
              phase="computing_embeddings"
              itemsProcessed={20}
              totalEstimate={100}
              message="computing_embeddings: 20/100"
              idleWarningMs={5_000}
            />
          </ThemeProvider>
        )

        expect(screen.queryByText(/No scan progress/i)).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("header", () => {
    it("shows 'Finding Duplicates' heading", () => {
      renderScanProgress()
      expect(screen.getByText("Finding Duplicates")).toBeInTheDocument()
    })

    it("shows only the active scan phase instead of a second four-card stepper", () => {
      renderScanProgress({ phase: "computing_embeddings" })
      expect(screen.getAllByText("Comparing photos and videos")).toHaveLength(1)
      expect(screen.queryByText("Loading previews")).not.toBeInTheDocument()
      expect(screen.queryByText("Preparing review sets")).not.toBeInTheDocument()
    })

    it("keeps technical activity collapsed by default", () => {
      renderScanProgress({ message: "embedding batch 3 of 10" })
      const details = screen.getByText("Technical activity").closest("details")
      expect(details).not.toHaveAttribute("open")
      expect(details).toHaveTextContent("embedding batch 3 of 10")
    })
  })
})
