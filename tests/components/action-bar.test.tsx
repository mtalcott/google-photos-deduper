/**
 * Component tests for ActionBar.
 *
 * Covers:
 * - Stats display (items scanned, group count)
 * - Button visibility based on groupCount
 * - cleanup action disabled when duplicateCount === 0
 * - All callback props fire on the correct user action
 */
import { ThemeProvider } from "@mui/material/styles"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ActionBar, CleanupBar } from "../../components/ActionBar"
import theme from "../../lib/theme"

interface Props {
  totalItems?: number
  groupCount?: number
  totalGroupCount?: number
  reviewedGroupCount?: number
  exactGroupCount?: number
  similarGroupCount?: number
  duplicateCount?: number
  reviewFilter?: "all" | "exact" | "similar"
  onReviewFilterChange?: (filter: "all" | "exact" | "similar") => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onTrash?: () => void
  onRescan?: () => void
  onExportJson?: () => void
  onExportCsv?: () => void
  onApplyKeepStrategy?: (strategy: string) => void
  compact?: boolean
}

function renderActionBar(props: Props = {}) {
  const defaults = {
    totalItems: 500,
    groupCount: 3,
    totalGroupCount: 3,
    reviewedGroupCount: 3,
    exactGroupCount: 2,
    similarGroupCount: 1,
    duplicateCount: 6,
    reviewFilter: "all" as const,
    onReviewFilterChange: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onTrash: vi.fn(),
    onRescan: vi.fn(),
    onExportJson: vi.fn(),
    onExportCsv: vi.fn(),
    onApplyKeepStrategy: vi.fn()
  }
  const merged = { ...defaults, ...props }
  return {
    ...render(
      <ThemeProvider theme={theme}>
        <ActionBar
          totalItems={merged.totalItems}
          groupCount={merged.groupCount}
          totalGroupCount={merged.totalGroupCount}
          reviewedGroupCount={merged.reviewedGroupCount}
          exactGroupCount={merged.exactGroupCount}
          similarGroupCount={merged.similarGroupCount}
          reviewFilter={merged.reviewFilter}
          onReviewFilterChange={merged.onReviewFilterChange}
          onSelectAll={merged.onSelectAll}
          onDeselectAll={merged.onDeselectAll}
          onRescan={merged.onRescan}
          onExportJson={merged.onExportJson}
          onExportCsv={merged.onExportCsv}
          onApplyKeepStrategy={merged.onApplyKeepStrategy}
          compact={merged.compact}
        />
      </ThemeProvider>
    ),
    callbacks: merged
  }
}

// ============================================================
// Tests
// ============================================================

describe("ActionBar", () => {
  describe("stats display", () => {
    it("shows the total items scanned count", () => {
      renderActionBar({ totalItems: 12345 })
      expect(
        screen.getByText("12,345 photos and videos checked")
      ).toBeInTheDocument()
    })

    it("shows the duplicate group count (plural)", () => {
      renderActionBar({ groupCount: 5 })
      expect(screen.getByText("5 duplicate sets to review")).toBeInTheDocument()
    })

    it("shows singular 'duplicate group' when groupCount is 1", () => {
      renderActionBar({ groupCount: 1 })
      expect(screen.getByText("1 duplicate set to review")).toBeInTheDocument()
    })

    it("shows filtered and total group counts when a filter is active", () => {
      renderActionBar({
        groupCount: 2,
        totalGroupCount: 5,
        reviewFilter: "exact"
      })
      expect(screen.getByText("2 duplicate sets to review")).toBeInTheDocument()
      expect(screen.getByText("5 sets total")).toBeInTheDocument()
    })
  })

  describe("button visibility", () => {
    it("does not render action buttons when groupCount is 0", () => {
      renderActionBar({ groupCount: 0, totalGroupCount: 0 })
      expect(
        screen.queryByRole("button", { name: /Scan again/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: /Include all/i })
      ).not.toBeInTheDocument()
    })

    it("renders action buttons when groupCount > 0", () => {
      renderActionBar({ groupCount: 2 })
      expect(
        screen.getByRole("button", { name: /Scan again/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^Export report$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^Spreadsheet$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^Include all$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^Skip all$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /Auto Keep/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /All sets \(3\)/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /Identical \(2\)/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /Similar \(1\)/i })
      ).toBeInTheDocument()
    })

    it("keeps filter buttons visible when the active filter has no groups", () => {
      renderActionBar({ groupCount: 0, totalGroupCount: 3 })
      expect(
        screen.getByRole("button", { name: /All sets \(3\)/i })
      ).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Auto Keep/i })).toBeDisabled()
      expect(
        screen.getByRole("button", { name: /^Include all$/i })
      ).toBeDisabled()
    })
  })

  describe("CleanupBar", () => {
    it("is enabled when duplicateCount > 0", () => {
      render(
        <ThemeProvider theme={theme}>
          <CleanupBar
            duplicateCount={4}
            reviewedGroupCount={3}
            totalGroupCount={3}
            onTrash={vi.fn()}
          />
        </ThemeProvider>
      )
      const btn = screen.getByRole("button", {
        name: /Review & move 4 to Trash/i
      })
      expect(btn).toBeEnabled()
    })

    it("is disabled when duplicateCount is 0", () => {
      render(
        <ThemeProvider theme={theme}>
          <CleanupBar
            duplicateCount={0}
            reviewedGroupCount={3}
            totalGroupCount={3}
            onTrash={vi.fn()}
          />
        </ThemeProvider>
      )
      const btn = screen.getByRole("button", {
        name: /No duplicates selected/i
      })
      expect(btn).toBeDisabled()
    })

    it("shows singular item summary when duplicateCount is 1", () => {
      render(
        <ThemeProvider theme={theme}>
          <CleanupBar
            duplicateCount={1}
            reviewedGroupCount={3}
            totalGroupCount={3}
            onTrash={vi.fn()}
          />
        </ThemeProvider>
      )
      expect(screen.getByText("1 item ready")).toBeInTheDocument()
    })

    it("keeps cleanup locked until every visible set is reviewed", () => {
      render(
        <ThemeProvider theme={theme}>
          <CleanupBar
            duplicateCount={4}
            reviewedGroupCount={1}
            totalGroupCount={3}
            onTrash={vi.fn()}
          />
        </ThemeProvider>
      )
      expect(screen.getByText("2 sets left to review")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /Review 2 more to continue/i })
      ).toBeDisabled()
    })
  })

  describe("callbacks", () => {
    it("calls onRescan when Scan again is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Scan again/i }))
      expect(callbacks.onRescan).toHaveBeenCalledOnce()
    })

    it("calls onSelectAll when Include all is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /^Include all$/i }))
      expect(callbacks.onSelectAll).toHaveBeenCalledOnce()
    })

    it("calls onDeselectAll when Skip all is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Skip all/i }))
      expect(callbacks.onDeselectAll).toHaveBeenCalledOnce()
    })

    it("calls onReviewFilterChange when a filter is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Identical \(2\)/i }))
      expect(callbacks.onReviewFilterChange).toHaveBeenCalledWith("exact")
    })

    it("calls export callbacks when report buttons are clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /^Export report$/i }))
      fireEvent.click(screen.getByRole("button", { name: /^Spreadsheet$/i }))
      expect(callbacks.onExportJson).toHaveBeenCalledOnce()
      expect(callbacks.onExportCsv).toHaveBeenCalledOnce()
    })

    it("calls keep strategy callback from the Auto Keep menu", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Auto Keep/i }))
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Largest resolution/i })
      )
      expect(callbacks.onApplyKeepStrategy).toHaveBeenCalledWith(
        "largest_resolution"
      )
    })

    it("shows the non-storage-counting keep strategy", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Auto Keep/i }))
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Non-storage-counting/i })
      )
      expect(callbacks.onApplyKeepStrategy).toHaveBeenCalledWith(
        "non_storage_counting"
      )
    })

    it("keeps compact toolbar actions accessible by name", () => {
      const { callbacks } = renderActionBar({ compact: true })

      fireEvent.click(screen.getByRole("button", { name: /More/i }))
      fireEvent.click(screen.getByRole("menuitem", { name: /Scan again/i }))
      fireEvent.click(screen.getByRole("button", { name: /More/i }))
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Export audit report/i })
      )
      fireEvent.click(screen.getByRole("button", { name: /More/i }))
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Export spreadsheet/i })
      )
      fireEvent.click(screen.getByRole("button", { name: /Selection/i }))
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Include all sets/i })
      )
      fireEvent.click(screen.getByRole("button", { name: /Selection/i }))
      fireEvent.click(screen.getByRole("menuitem", { name: /Skip all sets/i }))

      expect(callbacks.onRescan).toHaveBeenCalledOnce()
      expect(callbacks.onExportJson).toHaveBeenCalledOnce()
      expect(callbacks.onExportCsv).toHaveBeenCalledOnce()
      expect(callbacks.onSelectAll).toHaveBeenCalledOnce()
      expect(callbacks.onDeselectAll).toHaveBeenCalledOnce()
    })

    it("does not call onTrash when cleanup is disabled", () => {
      const onTrash = vi.fn()
      render(
        <ThemeProvider theme={theme}>
          <CleanupBar
            duplicateCount={0}
            reviewedGroupCount={3}
            totalGroupCount={3}
            onTrash={onTrash}
          />
        </ThemeProvider>
      )
      const btn = screen.getByRole("button", {
        name: /No duplicates selected/i
      })
      fireEvent.click(btn)
      expect(onTrash).not.toHaveBeenCalled()
    })
  })
})
