/**
 * Component tests for DuplicateGroups.
 *
 * Covers:
 * - Multi-keep chip rendering (Keep this copy / Moves to Trash / none)
 * - Card click triggers onToggleKept
 * - Mark all copies for Trash action
 * - Zoom button opens the photo viewer modal
 * - Zoom button does not trigger onToggleKept (stopPropagation)
 */
import { ThemeProvider } from "@mui/material/styles"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DuplicateGroups } from "../../components/DuplicateGroups"
import theme from "../../lib/theme"
import type { DuplicateGroup, GpdMediaItem } from "../../lib/types"

// ============================================================
// Mocks
// ============================================================

vi.mock("../../components/useBlobUrl", () => ({
  useBlobUrl: (url: string | undefined) => ({
    blobUrl: url ? `blob:${url}` : undefined,
    loading: false
  })
}))

// Stub PhotoViewerModal so we can assert it opens without rendering the full dialog
vi.mock("../../components/PhotoViewerModal", () => ({
  PhotoViewerModal: ({
    open,
    items,
    onClose
  }: {
    open: boolean
    items: unknown[]
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="viewer-modal" data-item-count={items.length}>
        <button onClick={onClose}>close-modal</button>
      </div>
    ) : null
}))

// ============================================================
// Helpers
// ============================================================

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
    isOwned: true
  }
}

function makeGroup(id: string, ...mediaKeys: string[]): DuplicateGroup {
  return { id, mediaKeys, originalMediaKey: mediaKeys[0], similarity: 0.99 }
}

const mediaItems: Record<string, GpdMediaItem> = {
  img1: makeItem("img1"),
  img2: makeItem("img2"),
  img3: makeItem("img3")
}

const group = makeGroup("g1", "img1", "img2", "img3")

const defaultProps = {
  groups: [group],
  mediaItems,
  selectedGroupIds: new Set(["g1"]),
  reviewedGroupIds: new Set(["g1"]),
  onToggleGroup: vi.fn(),
  onSkipGroup: vi.fn(),
  keptByGroupId: new Map([["g1", new Set(["img1"])]]),
  onToggleKept: vi.fn(),
  onTrashAll: vi.fn()
}

// ============================================================
// Chip rendering
// ============================================================

describe("DuplicateGroups — chip rendering", () => {
  it("shows Keep chip only for kept item", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    const keepChips = screen.getAllByText("Keep this copy")
    expect(keepChips).toHaveLength(1)
  })

  it("shows an untouched default as a suggestion, not a decision", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        selectedGroupIds={new Set()}
        reviewedGroupIds={new Set()}
      />
    )

    expect(screen.getByText("Suggested keep")).toBeInTheDocument()
    expect(screen.queryByText("Keep this copy")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Keep img1.jpg" })
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("shows Trash chips for non-kept items when group is selected", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    // img2 and img3 are not kept and group is selected
    const trashChips = screen.getAllByText("Moves to Trash")
    expect(trashChips).toHaveLength(2)
  })

  it("shows no Trash chips when group is deselected", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        selectedGroupIds={new Set()} // deselected
      />
    )
    expect(screen.queryByText("Moves to Trash")).not.toBeInTheDocument()
  })

  it("shows multiple Keep chips when multiple items are kept", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        keptByGroupId={new Map([["g1", new Set(["img1", "img2"])]])}
      />
    )
    const keepChips = screen.getAllByText("Keep this copy")
    expect(keepChips).toHaveLength(2)
    const trashChips = screen.getAllByText("Moves to Trash")
    expect(trashChips).toHaveLength(1) // only img3
  })

  it("shows every item as trash when no copy is kept", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        keptByGroupId={new Map([["g1", new Set()]])}
      />
    )
    expect(screen.queryByText("Keep this copy")).not.toBeInTheDocument()
    expect(screen.getAllByText("Moves to Trash")).toHaveLength(3)
  })

  it("shows exact duplicate classification when metadata matches", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        groups={[
          {
            ...group,
            duplicateKind: "exact",
            matchReasons: ["same filename", "same dimensions"]
          }
        ]}
      />
    )
    expect(screen.getByText("Exact duplicate")).toBeInTheDocument()
    expect(
      screen.getByTitle("same filename, same dimensions")
    ).toBeInTheDocument()
  })

  it("shows per-item storage accounting status", () => {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        mediaItems={{
          img1: { ...makeItem("img1"), takesUpSpace: false },
          img2: { ...makeItem("img2"), takesUpSpace: true },
          img3: { ...makeItem("img3"), takesUpSpace: null }
        }}
      />
    )

    expect(screen.getByText("No storage")).toBeInTheDocument()
    expect(screen.getByText("Counts storage")).toBeInTheDocument()
    expect(screen.getByText("Storage unknown")).toBeInTheDocument()
  })
})

// ============================================================
// Group header item-kind label (PR #121)
// ============================================================

describe("DuplicateGroups — group item-kind label", () => {
  const video = (k: string): GpdMediaItem => ({
    ...makeItem(k),
    duration: 5000
  })

  /** Render a single group built from the given media-item map + key order. */
  function renderGroup(items: Record<string, GpdMediaItem>, keys: string[]) {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        groups={[makeGroup("gk", ...keys)]}
        mediaItems={items}
        selectedGroupIds={new Set(["gk"])}
        keptByGroupId={new Map([["gk", new Set([keys[0]])]])}
      />
    )
  }

  it('labels an all-photo group "N photos"', () => {
    renderGroup({ a: makeItem("a"), b: makeItem("b"), c: makeItem("c") }, [
      "a",
      "b",
      "c"
    ])
    expect(screen.getByText(/^3 photos$/)).toBeInTheDocument()
  })

  it('labels a single-photo group "1 photo" (singular)', () => {
    renderGroup({ a: makeItem("a") }, ["a"])
    expect(screen.getByText(/^1 photo$/)).toBeInTheDocument()
  })

  it('labels an all-video group "N videos"', () => {
    renderGroup({ a: video("a"), b: video("b") }, ["a", "b"])
    expect(screen.getByText(/^2 videos$/)).toBeInTheDocument()
  })

  it('labels a single-video group "1 video" (singular)', () => {
    renderGroup({ a: video("a") }, ["a"])
    expect(screen.getByText(/^1 video$/)).toBeInTheDocument()
  })

  it('falls back to the neutral "items" for a mixed photo + video group', () => {
    renderGroup({ a: makeItem("a"), b: video("b") }, ["a", "b"])
    expect(screen.getByText(/^2 items$/)).toBeInTheDocument()
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

describe("DuplicateGroups — keyboard review", () => {
  it("uses one named set control and supports Enter and Space", () => {
    const onToggleGroup = vi.fn()
    wrap(<DuplicateGroups {...defaultProps} onToggleGroup={onToggleGroup} />)

    const setControl = screen.getByRole("checkbox", {
      name: /Include duplicate set of 3 photos/i
    })
    expect(screen.getAllByRole("checkbox")).toHaveLength(1)

    fireEvent.keyDown(setControl, { key: "Enter" })
    fireEvent.keyDown(setControl, { key: " " })
    expect(onToggleGroup).toHaveBeenCalledTimes(2)
  })

  it("names keep choices and exposes their pressed state", () => {
    wrap(<DuplicateGroups {...defaultProps} />)

    expect(
      screen.getByRole("button", { name: "Keep img1.jpg" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: "Keep img2.jpg" })
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("records an explicit skip action", () => {
    const onSkipGroup = vi.fn()
    wrap(
      <DuplicateGroups
        {...defaultProps}
        reviewedGroupIds={new Set()}
        selectedGroupIds={new Set()}
        onSkipGroup={onSkipGroup}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Skip this set/i }))
    expect(onSkipGroup).toHaveBeenCalledWith("g1")
  })
})

// ============================================================
// Mark all copies for Trash
// ============================================================

describe("DuplicateGroups — trash all copies", () => {
  it("calls onTrashAll with the current group", () => {
    const onTrashAll = vi.fn()
    const onToggleGroup = vi.fn()
    wrap(
      <DuplicateGroups
        {...defaultProps}
        onTrashAll={onTrashAll}
        onToggleGroup={onToggleGroup}
      />
    )

    fireEvent.click(
      screen.getByRole("button", { name: /mark all copies for trash/i })
    )

    expect(onTrashAll).toHaveBeenCalledOnce()
    expect(onTrashAll).toHaveBeenCalledWith(group)
    expect(onToggleGroup).not.toHaveBeenCalled()
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

// ============================================================
// Large-list rendering
// ============================================================

describe("DuplicateGroups — virtualized rendering", () => {
  it("renders compact mode directly to avoid nested side-panel scrolling", () => {
    wrap(<DuplicateGroups {...defaultProps} compact />)

    expect(
      screen.queryByTestId("duplicate-groups-virtual-list")
    ).not.toBeInTheDocument()
    expect(screen.getByText("3 photos")).toBeInTheDocument()
    expect(screen.getByTitle("img3.jpg")).toBeInTheDocument()
  })

  it("does not mount every duplicate group in a large result set", () => {
    const largeMediaItems: Record<string, GpdMediaItem> = {}
    const largeGroups: DuplicateGroup[] = []
    const keptByGroupId = new Map<string, Set<string>>()
    const selectedGroupIds = new Set<string>()

    for (let i = 0; i < 80; i++) {
      const firstKey = `item-${i}-a`
      const secondKey = `item-${i}-b`
      largeMediaItems[firstKey] = makeItem(firstKey)
      largeMediaItems[secondKey] = makeItem(secondKey)
      const groupId = `group-${i}`
      largeGroups.push(makeGroup(groupId, firstKey, secondKey))
      keptByGroupId.set(groupId, new Set([firstKey]))
      selectedGroupIds.add(groupId)
    }

    wrap(
      <DuplicateGroups
        {...defaultProps}
        groups={largeGroups}
        mediaItems={largeMediaItems}
        selectedGroupIds={selectedGroupIds}
        keptByGroupId={keptByGroupId}
      />
    )

    expect(
      screen.getByTestId("duplicate-groups-virtual-list")
    ).toBeInTheDocument()
    expect(screen.getByText("80 Duplicate Sets to Review")).toBeInTheDocument()
    expect(screen.getByTitle("item-0-a.jpg")).toBeInTheDocument()
    expect(screen.queryByTitle("item-79-a.jpg")).not.toBeInTheDocument()
  })
})
