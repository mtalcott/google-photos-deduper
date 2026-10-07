/**
 * Component tests for ScanProgress.
 *
 * Covers:
 * - Phase label for each ScanPhase value
 * - Step number display
 * - Progress bar mode (determinate vs. indeterminate)
 * - Item counts in caption text
 * - Cancel button visibility and callback
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { ScanProgress } from "../../components/ScanProgress"
import type { ScanPhase } from "../../lib/types"

const theme = createTheme()

interface Props {
  phase?: ScanPhase
  itemsProcessed?: number
  totalEstimate?: number
  message?: string
  onCancel?: (() => void) | undefined
  oldestUploadedAt?: number | undefined
  oldestTakenAt?: number | undefined
}

function renderScanProgress(props: Props = {}) {
  const defaults: Required<Props> = {
    phase: "fetching",
    itemsProcessed: 0,
    totalEstimate: 0,
    message: "",
    onCancel: undefined,
    oldestUploadedAt: undefined,
    oldestTakenAt: undefined,
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
      ["fetching", "Fetching media items", 1],
      ["downloading_thumbnails", "Downloading thumbnails", 2],
      ["computing_embeddings", "Computing image similarity", 3],
      ["detecting_duplicates", "Finding duplicate groups", 4],
      ["complete", "Complete", 4],
    ]

    it.each(cases)("phase '%s' shows label '%s' (step %i)", (phase, label, step) => {
      renderScanProgress({ phase })
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByText(`Step ${step} of 4`)).toBeInTheDocument()
    })
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
      expect(screen.getByText("123 items processed")).toBeInTheDocument()
    })

    it("shows processed / total when totalEstimate > 0", () => {
      renderScanProgress({ itemsProcessed: 300, totalEstimate: 1000 })
      expect(screen.getByText("300 items processed / 1,000")).toBeInTheDocument()
    })

    it("formats large numbers with locale separators", () => {
      renderScanProgress({ itemsProcessed: 12345, totalEstimate: 50000 })
      expect(screen.getByText("12,345 items processed / 50,000")).toBeInTheDocument()
    })
  })

  describe("cancel button", () => {
    it("does not render Cancel button when onCancel is not provided", () => {
      renderScanProgress({ onCancel: undefined })
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
    })

    it("renders Cancel button when onCancel is provided", () => {
      renderScanProgress({ onCancel: vi.fn() })
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
    })

    it("calls onCancel when Cancel button is clicked", () => {
      const onCancel = vi.fn()
      renderScanProgress({ onCancel })
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
      expect(onCancel).toHaveBeenCalledOnce()
    })
  })

  describe("header", () => {
    it("shows 'Scanning Library' heading", () => {
      renderScanProgress()
      expect(screen.getByText("Scanning Library")).toBeInTheDocument()
    })
  })

  // ============================================================
  // Fetch position readout
  //
  // Pagination is newest-first by UPLOAD date, so the upload date walks
  // backwards monotonically and is the honest "how far have we got" signal.
  // The taken date is shown alongside because the two often diverge.
  // ============================================================

  describe("fetch position", () => {
    const MAR_2023 = Date.parse("2023-03-12T10:00:00Z")
    const JUL_2019 = Date.parse("2019-07-04T10:00:00Z")

    it("shows the upload position during the fetching phase", () => {
      renderScanProgress({ phase: "fetching", oldestUploadedAt: MAR_2023 })
      const el = screen.getByTestId("fetch-position")
      expect(el).toHaveTextContent(/uploads from/i)
      expect(el).toHaveTextContent(/2023/)
    })

    it("shows the taken date alongside the upload date", () => {
      renderScanProgress({
        phase: "fetching",
        oldestUploadedAt: MAR_2023,
        oldestTakenAt: JUL_2019,
      })
      const el = screen.getByTestId("fetch-position")
      expect(el).toHaveTextContent(/2023/)
      expect(el).toHaveTextContent(/taken/i)
      expect(el).toHaveTextContent(/2019/)
    })

    it("omits the taken date when it is absent", () => {
      renderScanProgress({ phase: "fetching", oldestUploadedAt: MAR_2023 })
      expect(screen.getByTestId("fetch-position")).not.toHaveTextContent(/taken/i)
    })

    it("renders nothing when no upload date has arrived yet", () => {
      renderScanProgress({ phase: "fetching" })
      expect(screen.queryByTestId("fetch-position")).not.toBeInTheDocument()
    })

    // Items with a 0 or non-finite timestamp exist in real libraries; they must
    // not render as 1 Jan 1970.
    it("renders nothing for a zero timestamp", () => {
      renderScanProgress({ phase: "fetching", oldestUploadedAt: 0 })
      expect(screen.queryByTestId("fetch-position")).not.toBeInTheDocument()
    })

    it("renders nothing for a non-finite timestamp", () => {
      renderScanProgress({ phase: "fetching", oldestUploadedAt: NaN })
      expect(screen.queryByTestId("fetch-position")).not.toBeInTheDocument()
    })

    it("is only shown while fetching, not in later phases", () => {
      for (const phase of [
        "downloading_thumbnails",
        "computing_embeddings",
        "detecting_duplicates",
      ] as ScanPhase[]) {
        const { unmount } = renderScanProgress({ phase, oldestUploadedAt: MAR_2023 })
        expect(screen.queryByTestId("fetch-position")).not.toBeInTheDocument()
        unmount()
      }
    })
  })
})
