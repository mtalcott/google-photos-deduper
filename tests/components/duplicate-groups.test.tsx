/**
 * Component tests for DuplicateGroups.
 *
 * Covers:
 * - Multi-keep chip rendering (Keep / Trash / none)
 * - Card click triggers onToggleKept
 * - Zoom button opens the photo viewer modal
 * - Zoom button does not trigger onToggleKept (stopPropagation)
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { DuplicateGroups } from "../../components/DuplicateGroups"
import type { GpdMediaItem, DuplicateGroup } from "../../lib/types"

// ============================================================
// Mocks
// ============================================================

vi.mock("../../components/useBlobUrl", () => ({
  useBlobUrl: (url: string | undefined) => ({ blobUrl: url ? `blob:${url}` : undefined, loading: false }),
}))

// Stub PhotoViewerModal so we can assert it opens without rendering the full dialog
vi.mock("../../components/PhotoViewerModal", () => ({
  PhotoViewerModal: ({ open, items, onClose }: { open: boolean; items: unknown[]; onClose: () => void }) =>
    open ? (
      <div data-testid="viewer-modal" data-item-count={items.length}>
        <button onClick={onClose}>close-modal</button>
      </div>
    ) : null,
}))

// ============================================================
// Helpers
// ============================================================

const theme = createTheme()

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

function makeItem(mediaKey: string): GpdMediaItem {
  return {
    mediaKey,
    dedupKey: `dk-${mediaKey}`,
    thumb: `https://example.com/${mediaKey}`,
    productUrl: `https://photos.google.com/photo/${mediaKey}`,
    timestamp: Date.parse("2023-09-24"),
    creationTimestamp: Date.parse("2023-09-24"),
    resWidth: 1920,
    resHeight: 1080,
    fileName: `${mediaKey}.jpg`,
    isOwned: true,
  }
}

function makeGroup(id: string, ...mediaKeys: string[]): DuplicateGroup {
  return { id, mediaKeys, originalMediaKey: mediaKeys[0], similarity: 0.99 }
}

const mediaItems: Record<string, GpdMediaItem> = {
  img1: makeItem("img1"),
  img2: makeItem("img2"),
  img3: makeItem("img3"),
}

const group = makeGroup("g1", "img1", "img2", "img3")

const defaultProps = {
  groups: [group],
  mediaItems,
  selectedGroupIds: new Set(["g1"]),
  onToggleGroup: vi.fn(),
  keptByGroupId: new Map([["g1", new Set(["img1"])]]),
  onToggleKept: vi.fn(),
}

// ============================================================
// Chip rendering
// ============================================================

describe("DuplicateGroups — chip rendering", () => {
  it("shows Keep chip only for kept item", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    const keepChips = screen.getAllByText("Keep")
    expect(keepChips).toHaveLength(1)
  })

  it("shows Trash chips for non-kept items when group is selected", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    // img2 and img3 are not kept and group is selected
    const trashChips = screen.getAllByText("Trash")
    expect(trashChips).toHaveLength(2)
  })

  it("shows no Trash chips when group is deselected", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        selectedGroupIds={new Set()} // deselected
      />
    )
    expect(screen.queryByText("Trash")).not.toBeInTheDocument()
  })

  it("shows multiple Keep chips when multiple items are kept", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        keptByGroupId={new Map([["g1", new Set(["img1", "img2"])]])}
      />
    )
    const keepChips = screen.getAllByText("Keep")
    expect(keepChips).toHaveLength(2)
    const trashChips = screen.getAllByText("Trash")
    expect(trashChips).toHaveLength(1) // only img3
  })
})

// ============================================================
// Card click → onToggleKept
// ============================================================

describe("DuplicateGroups — card click", () => {
  it("calls onToggleKept with the correct group and mediaKey", () => {
    const onToggleKept = vi.fn()
    wrap(<DuplicateGroups {...defaultProps} onToggleKept={onToggleKept} />)

    // Click the second card (img2)
    // Each card has a CardActionArea; we target the one containing img2.jpg
    const img2Card = screen.getByTitle("img2.jpg").closest("button")
    expect(img2Card).toBeTruthy()
    fireEvent.click(img2Card!)

    expect(onToggleKept).toHaveBeenCalledOnce()
    expect(onToggleKept).toHaveBeenCalledWith(group, "img2")
  })
})

// ============================================================
// Zoom overlay → opens viewer modal
// ============================================================

describe("DuplicateGroups — zoom overlay", () => {
  it("opens the photo viewer modal when zoom button is clicked", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    expect(screen.queryByTestId("viewer-modal")).not.toBeInTheDocument()

    const zoomBtns = screen.getAllByRole("button", { name: /view full size/i })
    fireEvent.click(zoomBtns[0])

    expect(screen.getByTestId("viewer-modal")).toBeInTheDocument()
  })

  it("closes the viewer modal when onClose is called", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    const zoomBtns = screen.getAllByRole("button", { name: /view full size/i })
    fireEvent.click(zoomBtns[0])

    expect(screen.getByTestId("viewer-modal")).toBeInTheDocument()
    fireEvent.click(screen.getByText("close-modal"))
    expect(screen.queryByTestId("viewer-modal")).not.toBeInTheDocument()
  })

  it("opens the viewer for the correct item index", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    const zoomBtns = screen.getAllByRole("button", { name: /view full size/i })
    // Click the second zoom button (index 1 → img2)
    fireEvent.click(zoomBtns[1])

    const modal = screen.getByTestId("viewer-modal")
    expect(modal).toBeInTheDocument()
    // The modal receives all 3 items (filtered from group.mediaKeys)
    expect(modal).toHaveAttribute("data-item-count", "3")
  })

  it("zoom button click does NOT call onToggleKept", () => {
    const onToggleKept = vi.fn()
    wrap(<DuplicateGroups {...defaultProps} onToggleKept={onToggleKept} />)

    const zoomBtns = screen.getAllByRole("button", { name: /view full size/i })
    fireEvent.click(zoomBtns[0])

    expect(onToggleKept).not.toHaveBeenCalled()
  })
})

// ============================================================
// Empty state
// ============================================================

describe("DuplicateGroups — empty state", () => {
  it("shows no duplicates message when groups is empty", () => {
    wrap(<DuplicateGroups {...defaultProps} groups={[]} />)
    expect(screen.getByText(/no duplicates found/i)).toBeInTheDocument()
  })
})
