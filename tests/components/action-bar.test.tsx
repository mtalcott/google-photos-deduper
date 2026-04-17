/**
 * Component tests for ActionBar.
 *
 * Covers:
 * - Stats display (items scanned, group count)
 * - Button visibility based on groupCount
 * - "Move to Trash" button disabled when duplicateCount === 0
 * - All callback props fire on the correct user action
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { ActionBar } from "../../components/ActionBar"

const theme = createTheme()

interface Props {
  totalItems?: number
  groupCount?: number
  duplicateCount?: number
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onTrash?: () => void
  onRescan?: () => void
}

function renderActionBar(props: Props = {}) {
  const defaults = {
    totalItems: 500,
    groupCount: 3,
    duplicateCount: 6,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onTrash: vi.fn(),
    onRescan: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  return {
    ...render(
      <ThemeProvider theme={theme}>
        <ActionBar {...merged} />
      </ThemeProvider>
    ),
    callbacks: merged,
  }
}

// ============================================================
// Tests
// ============================================================

describe("ActionBar", () => {
  describe("stats display", () => {
    it("shows the total items scanned count", () => {
      renderActionBar({ totalItems: 12345 })
      expect(screen.getByText("12,345 items scanned")).toBeInTheDocument()
    })

    it("shows the duplicate group count (plural)", () => {
      renderActionBar({ groupCount: 5 })
      expect(screen.getByText("5 duplicate groups")).toBeInTheDocument()
    })

    it("shows singular 'duplicate group' when groupCount is 1", () => {
      renderActionBar({ groupCount: 1 })
      expect(screen.getByText("1 duplicate group")).toBeInTheDocument()
    })
  })

  describe("button visibility", () => {
    it("does not render action buttons when groupCount is 0", () => {
      renderActionBar({ groupCount: 0 })
      expect(screen.queryByRole("button", { name: /Re-scan/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Select All/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Trash/i })).not.toBeInTheDocument()
    })

    it("renders action buttons when groupCount > 0", () => {
      renderActionBar({ groupCount: 2 })
      expect(screen.getByRole("button", { name: /Re-scan/i })).toBeInTheDocument()
      // Use exact regex to avoid /Select All/i matching "Deselect All"
      expect(screen.getByRole("button", { name: /^Select All$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^Deselect All$/i })).toBeInTheDocument()
    })
  })

  describe("Move to Trash button", () => {
    it("is enabled when duplicateCount > 0", () => {
      renderActionBar({ duplicateCount: 4 })
      const btn = screen.getByRole("button", { name: /Move 4 Duplicates to Trash/i })
      expect(btn).toBeEnabled()
    })

    it("is disabled when duplicateCount is 0", () => {
      renderActionBar({ duplicateCount: 0 })
      const btn = screen.getByRole("button", { name: /Move 0 Duplicates? to Trash/i })
      expect(btn).toBeDisabled()
    })

    it("shows singular 'Duplicate' when duplicateCount is 1", () => {
      renderActionBar({ duplicateCount: 1 })
      expect(
        screen.getByRole("button", { name: /Move 1 Duplicate to Trash/i })
      ).toBeInTheDocument()
    })
  })

  describe("callbacks", () => {
    it("calls onRescan when Re-scan is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Re-scan/i }))
      expect(callbacks.onRescan).toHaveBeenCalledOnce()
    })

    it("calls onSelectAll when Select All is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /^Select All$/i }))
      expect(callbacks.onSelectAll).toHaveBeenCalledOnce()
    })

    it("calls onDeselectAll when Deselect All is clicked", () => {
      const { callbacks } = renderActionBar()
      fireEvent.click(screen.getByRole("button", { name: /Deselect All/i }))
      expect(callbacks.onDeselectAll).toHaveBeenCalledOnce()
    })

    it("calls onTrash when Move to Trash is clicked", () => {
      const { callbacks } = renderActionBar({ duplicateCount: 3 })
      fireEvent.click(screen.getByRole("button", { name: /Move 3 Duplicates to Trash/i }))
      expect(callbacks.onTrash).toHaveBeenCalledOnce()
    })

    it("does not call onTrash when button is disabled", () => {
      const { callbacks } = renderActionBar({ duplicateCount: 0 })
      const btn = screen.getByRole("button", { name: /Move 0 Duplicates? to Trash/i })
      fireEvent.click(btn)
      expect(callbacks.onTrash).not.toHaveBeenCalled()
    })
  })
})
