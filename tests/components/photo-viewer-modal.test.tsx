/**
 * Component tests for PhotoViewerModal.
 *
 * We mock global fetch so useGroupBlobUrls resolves immediately with a
 * stable blob URL, letting us test navigation and UI state synchronously.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { PhotoViewerModal } from "../../components/PhotoViewerModal"
import type { GpdMediaItem } from "../../lib/types"

// ============================================================
// Mocks
// ============================================================

// Stub fetch → immediately resolves with a Blob so useGroupBlobUrls populates fast.
// URL.createObjectURL is not available in happy-dom; stub it too.
const mockObjectUrl = "blob:mock"
vi.stubGlobal("URL", {
  ...URL,
  createObjectURL: () => mockObjectUrl,
  revokeObjectURL: () => {},
})

vi.stubGlobal("fetch", (_url: string) =>
  Promise.resolve({
    ok: true,
    blob: () => Promise.resolve(new Blob(["img"], { type: "image/jpeg" })),
  } as Response)
)

// ============================================================
// Helpers
// ============================================================

const theme = createTheme()

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

function makeItem(mediaKey: string, overrides: Partial<GpdMediaItem> = {}): GpdMediaItem {
  return {
    mediaKey,
    dedupKey: `dk-${mediaKey}`,
    thumb: `https://example.com/${mediaKey}`,
    productUrl: `https://photos.google.com/photo/${mediaKey}`,
    timestamp: Date.parse("2023-09-24"),
    creationTimestamp: Date.parse("2023-09-24"),
    resWidth: 3024,
    resHeight: 4032,
    fileName: `${mediaKey}.jpg`,
    isOwned: true,
    ...overrides,
  }
}

const items = [makeItem("img1"), makeItem("img2"), makeItem("img3")]

const defaultProps = {
  open: true,
  items,
  initialIndex: 0,
  keptSet: new Set(["img1"]),
  isGroupSelected: true,
  onClose: vi.fn(),
}

// ============================================================
// Rendering
// ============================================================

describe("PhotoViewerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the modal when open=true", () => {
    wrap(<PhotoViewerModal {...defaultProps} />)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("does not render when items is empty", () => {
    wrap(<PhotoViewerModal {...defaultProps} items={[]} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the filename in the header", () => {
    wrap(<PhotoViewerModal {...defaultProps} />)
    expect(screen.getByText(/img1\.jpg/)).toBeInTheDocument()
  })

  it("shows the counter for multi-item groups", () => {
    wrap(<PhotoViewerModal {...defaultProps} />)
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it("shows resolution and taken date in footer", () => {
    wrap(<PhotoViewerModal {...defaultProps} />)
    expect(screen.getByText(/3024×4032/)).toBeInTheDocument()
    expect(screen.getByText(/Taken/)).toBeInTheDocument()
  })
})

// ============================================================
// Keep / Trash chip
// ============================================================

describe("PhotoViewerModal — chip display", () => {
  it("shows Keep chip for a kept item", () => {
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        keptSet={new Set(["img1"])}
        isGroupSelected={true}
      />
    )
    expect(screen.getByText("Keep")).toBeInTheDocument()
    expect(screen.queryByText("Trash")).not.toBeInTheDocument()
  })

  it("shows Trash chip for a non-kept item in a selected group", () => {
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={1}
        keptSet={new Set(["img1"])} // img2 is not kept
        isGroupSelected={true}
      />
    )
    expect(screen.getByText("Trash")).toBeInTheDocument()
    expect(screen.queryByText("Keep")).not.toBeInTheDocument()
  })

  it("shows no chip for non-kept item in a deselected group", () => {
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={1}
        keptSet={new Set(["img1"])}
        isGroupSelected={false}
      />
    )
    expect(screen.queryByText("Trash")).not.toBeInTheDocument()
    expect(screen.queryByText("Keep")).not.toBeInTheDocument()
  })
})

// ============================================================
// Navigation
// ============================================================

describe("PhotoViewerModal — navigation", () => {
  it("disables the Previous button on the first item", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={0} />)
    const prevBtn = screen.getByRole("button", { name: /previous photo/i })
    expect(prevBtn).toBeDisabled()
  })

  it("disables the Next button on the last item", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={2} />)
    const nextBtn = screen.getByRole("button", { name: /next photo/i })
    expect(nextBtn).toBeDisabled()
  })

  it("advances to the next item on Next click", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={0} />)
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /next photo/i }))
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
    expect(screen.getByText(/img2\.jpg/)).toBeInTheDocument()
  })

  it("goes back to the previous item on Previous click", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={2} />)
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /previous photo/i }))
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  it("navigates forward with ArrowRight key", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={0} />)
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  it("navigates backward with ArrowLeft key", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={1} />)
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it("does not go below index 0 with ArrowLeft at first item", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={0} />)
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
  })

  it("does not go above last index with ArrowRight at last item", () => {
    wrap(<PhotoViewerModal {...defaultProps} initialIndex={2} />)
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByText(/3 \/ 3/)).toBeInTheDocument()
  })

  it("resets index to initialIndex when items change", () => {
    const { rerender } = wrap(<PhotoViewerModal {...defaultProps} initialIndex={0} />)
    
    // Navigate to next photo (index 1)
    fireEvent.click(screen.getByRole("button", { name: /next photo/i }))
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
    
    // Now rerender with a new set of items
    const newItems = [makeItem("new1"), makeItem("new2")]
    rerender(
      <ThemeProvider theme={theme}>
        <PhotoViewerModal
          {...defaultProps}
          items={newItems}
          initialIndex={0}
        />
      </ThemeProvider>
    )
    
    // Verify it reset to photo 1 of the new items
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()
  })
})

// ============================================================
// Google Photos link
// ============================================================

describe("PhotoViewerModal — Google Photos link", () => {
  it("shows the View in Google Photos link when productUrl is present", () => {
    wrap(<PhotoViewerModal {...defaultProps} />)
    const link = screen.getByRole("link", { name: /view in google photos/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://photos.google.com/photo/img1")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("does not show the link when productUrl is absent", () => {
    const itemsNoUrl = items.map((item) => ({ ...item, productUrl: undefined }))
    wrap(<PhotoViewerModal {...defaultProps} items={itemsNoUrl} />)
    expect(screen.queryByRole("link", { name: /view in google photos/i })).not.toBeInTheDocument()
  })
})

// ============================================================
// Close button
// ============================================================

describe("PhotoViewerModal — close", () => {
  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn()
    wrap(<PhotoViewerModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: /close photo viewer/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ============================================================
// Keyboard Keep Toggling (ArrowUp / ArrowDown)
// ============================================================

describe("PhotoViewerModal — keyboard keep toggling", () => {
  it("calls onToggleKept when pressing ArrowUp on a non-kept image", () => {
    const onToggleKept = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={1}
        onToggleKept={onToggleKept}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowUp" })
    expect(onToggleKept).toHaveBeenCalledWith("img2")
  })

  it("does NOT call onToggleKept when pressing ArrowUp on an already kept image", () => {
    const onToggleKept = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={0}
        onToggleKept={onToggleKept}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowUp" })
    expect(onToggleKept).not.toHaveBeenCalled()
  })

  it("calls onToggleKept when pressing ArrowDown on a kept image", () => {
    const onToggleKept = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={0}
        onToggleKept={onToggleKept}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(onToggleKept).toHaveBeenCalledWith("img1")
  })

  it("does NOT call onToggleKept when pressing ArrowDown on a non-kept image", () => {
    const onToggleKept = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        initialIndex={1}
        onToggleKept={onToggleKept}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowDown" })
    expect(onToggleKept).not.toHaveBeenCalled()
  })
})

// ============================================================
// Shift Keyboard Group Shortcuts
// ============================================================

describe("PhotoViewerModal — Shift keyboard group shortcuts", () => {
  it("calls onToggleGroup (if not selected) and onNextGroup on Shift + ArrowUp", () => {
    const onToggleGroup = vi.fn()
    const onNextGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        isGroupSelected={false}
        onToggleGroup={onToggleGroup}
        onNextGroup={onNextGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowUp", shiftKey: true })
    expect(onToggleGroup).toHaveBeenCalledOnce()
    expect(onNextGroup).toHaveBeenCalledOnce()
  })

  it("does NOT call onToggleGroup (if already selected) but still calls onNextGroup on Shift + ArrowUp", () => {
    const onToggleGroup = vi.fn()
    const onNextGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        isGroupSelected={true}
        onToggleGroup={onToggleGroup}
        onNextGroup={onNextGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowUp", shiftKey: true })
    expect(onToggleGroup).not.toHaveBeenCalled()
    expect(onNextGroup).toHaveBeenCalledOnce()
  })

  it("calls onToggleGroup on Shift + ArrowDown if group is selected", () => {
    const onToggleGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        isGroupSelected={true}
        onToggleGroup={onToggleGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true })
    expect(onToggleGroup).toHaveBeenCalledOnce()
  })

  it("does NOT call onToggleGroup on Shift + ArrowDown if group is not selected", () => {
    const onToggleGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        isGroupSelected={false}
        onToggleGroup={onToggleGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true })
    expect(onToggleGroup).not.toHaveBeenCalled()
  })

  it("calls onPrevGroup on Shift + ArrowLeft", () => {
    const onPrevGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        onPrevGroup={onPrevGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true })
    expect(onPrevGroup).toHaveBeenCalledOnce()
  })

  it("calls onNextGroup on Shift + ArrowRight", () => {
    const onNextGroup = vi.fn()
    wrap(
      <PhotoViewerModal
        {...defaultProps}
        onNextGroup={onNextGroup}
      />
    )
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true })
    expect(onNextGroup).toHaveBeenCalledOnce()
  })
})
