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
import { render, screen, fireEvent, act } from "@testing-library/react"
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
// Group header item-kind label (PR #121)
// ============================================================

describe("DuplicateGroups — group item-kind label", () => {
  const video = (k: string): GpdMediaItem => ({ ...makeItem(k), duration: 5000 })

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
    renderGroup(
      { a: makeItem("a"), b: makeItem("b"), c: makeItem("c") },
      ["a", "b", "c"]
    )
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
// Spacebar preview
// ============================================================

describe("DuplicateGroups — Spacebar preview", () => {
  it("opens the viewer modal when 'Space' is pressed while hovering a photo", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    expect(screen.queryByTestId("viewer-modal")).not.toBeInTheDocument()

    const img1Card = screen.getByTitle("img1.jpg").closest(".MuiBox-root")
    expect(img1Card).toBeTruthy()

    // Hover over the first photo
    act(() => {
      fireEvent.mouseOver(img1Card!)
    })

    // Press ' ' (Spacebar)
    const spy = vi.spyOn(KeyboardEvent.prototype, "preventDefault")
    act(() => {
      fireEvent.keyDown(window, { key: " ", code: "Space" })
    })

    expect(screen.getByTestId("viewer-modal")).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("does not open the viewer modal when 'Space' is pressed but no photo is hovered", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    fireEvent.keyDown(window, { key: " ", code: "Space" })
    expect(screen.queryByTestId("viewer-modal")).not.toBeInTheDocument()
  })
})

// ============================================================
// Split-bucket caveat
// ============================================================

describe("split bucket notice", () => {
  it("warns when timestamp buckets were split", () => {
    wrap(<DuplicateGroups {...defaultProps} bucketsSplit={3} />)
    const notice = screen.getByTestId("split-buckets-notice")
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveTextContent(/3 large time groups/i)
    expect(notice).toHaveTextContent(/may be missed/i)
  })

  it("uses singular wording for a single split group", () => {
    wrap(<DuplicateGroups {...defaultProps} bucketsSplit={1} />)
    expect(screen.getByTestId("split-buckets-notice")).toHaveTextContent(
      /1 large time group was split/i
    )
  })

  it("shows nothing when no buckets were split", () => {
    wrap(<DuplicateGroups {...defaultProps} bucketsSplit={0} />)
    expect(screen.queryByTestId("split-buckets-notice")).not.toBeInTheDocument()
  })

  // Results saved before this field existed load without it.
  it("shows nothing when bucketsSplit is absent", () => {
    wrap(<DuplicateGroups {...defaultProps} />)
    expect(screen.queryByTestId("split-buckets-notice")).not.toBeInTheDocument()
  })
})

// ============================================================
// Favorite badge
//
// Favorites win the default keep, so the star is what explains why a
// particular photo was chosen.
// ============================================================

describe("favorite badge", () => {
  const favorite = (k: string): GpdMediaItem => ({ ...makeItem(k), isFavorite: true })

  function renderWith(items: Record<string, GpdMediaItem>, keys: string[]) {
    wrap(
      <DuplicateGroups
        {...defaultProps}
        groups={[makeGroup("gf", ...keys)]}
        mediaItems={items}
        selectedGroupIds={new Set(["gf"])}
        keptByGroupId={new Map([["gf", new Set([keys[0]])]])}
      />
    )
  }

  it("marks a favorited photo with a star", () => {
    renderWith({ a: favorite("a"), b: makeItem("b") }, ["a", "b"])
    expect(screen.getByTestId("favorite-badge-a")).toBeInTheDocument()
  })

  it("does not mark a non-favorited photo", () => {
    renderWith({ a: favorite("a"), b: makeItem("b") }, ["a", "b"])
    expect(screen.queryByTestId("favorite-badge-b")).not.toBeInTheDocument()
  })

  // Google omits the field rather than sending false.
  it("does not mark a photo whose isFavorite is absent", () => {
    renderWith({ a: makeItem("a"), b: makeItem("b") }, ["a", "b"])
    expect(screen.queryByTestId("favorite-badge-a")).not.toBeInTheDocument()
  })

  it("marks every favorited photo in a group", () => {
    renderWith(
      { a: favorite("a"), b: makeItem("b"), c: favorite("c") },
      ["a", "b", "c"]
    )
    expect(screen.getByTestId("favorite-badge-a")).toBeInTheDocument()
    expect(screen.getByTestId("favorite-badge-c")).toBeInTheDocument()
    expect(screen.queryByTestId("favorite-badge-b")).not.toBeInTheDocument()
  })

  it("marks a favorite regardless of whether it is the kept photo", () => {
    renderWith({ a: makeItem("a"), b: favorite("b") }, ["a", "b"])
    expect(screen.getByTestId("favorite-badge-b")).toBeInTheDocument()
  })

  // It reports Google Photos state we cannot change from here, so it must not
  // be a control — and must not steal the card's keep/trash click.
  it("is not a button", () => {
    renderWith({ a: favorite("a") }, ["a"])
    expect(screen.getByTestId("favorite-badge-a").tagName).not.toBe("BUTTON")
  })

  it("explains itself on hover", () => {
    renderWith({ a: favorite("a") }, ["a"])
    expect(screen.getByTestId("favorite-badge-a")).toHaveAttribute(
      "title",
      expect.stringMatching(/favorite/i)
    )
  })
})
