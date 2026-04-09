import { useState, useEffect } from "react"
import { keyframes } from "@emotion/react"
import Box from "@mui/material/Box"
import CardMedia from "@mui/material/CardMedia"
import Chip from "@mui/material/Chip"
import CircularProgress from "@mui/material/CircularProgress"
import Dialog from "@mui/material/Dialog"
import DialogContent from "@mui/material/DialogContent"
import IconButton from "@mui/material/IconButton"
import Link from "@mui/material/Link"
import Typography from "@mui/material/Typography"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CloseIcon from "@mui/icons-material/Close"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import type { GpdMediaItem } from "../lib/types"

/**
 * Preloads full-res blob URLs for all items in the group as soon as the modal
 * opens. Returns a stable map of mediaKey → blobUrl so navigating between
 * images is instant (no per-image fetch on demand).
 *
 * Deps are the joined thumb URLs so the effect only re-runs when the group
 * actually changes, not on every render.
 */
function useGroupBlobUrls(items: GpdMediaItem[]): Record<string, string | undefined> {
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({})

  const thumbKey = items.map((i) => i.thumb).join("|")

  useEffect(() => {
    const controllers: AbortController[] = []
    const createdUrls: string[] = []
    let cancelled = false

    setBlobUrls({})

    items.forEach((item) => {
      const controller = new AbortController()
      controllers.push(controller)

      fetch(item.thumb, { credentials: "include", signal: controller.signal })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (blob && !cancelled) {
            const url = URL.createObjectURL(blob)
            createdUrls.push(url)
            setBlobUrls((prev) => ({ ...prev, [item.mediaKey]: url }))
          }
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      controllers.forEach((c) => c.abort())
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbKey])

  return blobUrls
}

interface FullResImageProps {
  item: GpdMediaItem
  blobUrl: string | undefined
}

function FullResImage({ item, blobUrl }: FullResImageProps) {
  if (!blobUrl) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}>
        <CircularProgress sx={{ color: "white" }} />
      </Box>
    )
  }
  return (
    <CardMedia
      component="img"
      image={blobUrl}
      alt={item.fileName || item.mediaKey}
      sx={{
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        display: "block",
        mx: "auto",
      }}
    />
  )
}

export interface PhotoViewerModalProps {
  open: boolean
  items: GpdMediaItem[]
  initialIndex: number
  keptSet: Set<string>
  isGroupSelected: boolean
  onClose: () => void
}

const slideInFromRight = keyframes`
  from { transform: translateX(10px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
`
const slideInFromLeft = keyframes`
  from { transform: translateX(-10px); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
`

export function PhotoViewerModal({
  open,
  items,
  initialIndex,
  keptSet,
  isGroupSelected,
  onClose,
}: PhotoViewerModalProps) {
  const [index, setIndex] = useState(initialIndex)
  const [slideDir, setSlideDir] = useState<"forward" | "backward">("forward")

  // Preload all images in the group up front
  const blobUrls = useGroupBlobUrls(items)

  // Reset index when the modal opens or the initial photo changes
  useEffect(() => {
    setIndex(initialIndex)
  }, [open, initialIndex])

  const navigate = (newIndex: number) => {
    if (newIndex === index) return
    setSlideDir(newIndex > index ? "forward" : "backward")
    setIndex(newIndex)
  }

  // Keyboard navigation (arrow keys only; MUI Dialog handles Escape → onClose)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigate(Math.max(0, index - 1))
      if (e.key === "ArrowRight") navigate(Math.min(items.length - 1, index + 1))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, index, items.length])

  if (items.length === 0) return null

  const safeIndex = Math.min(index, items.length - 1)
  const item = items[safeIndex]
  const isKept = keptSet.has(item.mediaKey)
  const isFirst = safeIndex === 0
  const isLast = safeIndex === items.length - 1

  const takenDate = item.timestamp
    ? new Date(item.timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  const uploadedDate = item.creationTimestamp
    ? new Date(item.creationTimestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-label="Photo viewer"
      PaperProps={{
        sx: {
          bgcolor: "#111",
          color: "white",
          position: "relative",
          overflow: "hidden",
        },
      }}>
      {/* Header bar: filename left, counter center, close right */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}>
        <Typography
          variant="caption"
          noWrap
          sx={{ color: "rgba(255,255,255,0.45)", pl: 1 }}>
          {item.fileName || ""}
        </Typography>

        {/* Counter — centered, prominent, slides on navigation */}
        {items.length > 1 && (
          <Typography
            key={safeIndex}
            variant="body2"
            fontWeight={600}
            sx={{
              color: "white",
              textAlign: "center",
              letterSpacing: "0.05em",
              animation: `${slideDir === "forward" ? slideInFromRight : slideInFromLeft} 150ms ease-out`,
            }}>
            {safeIndex + 1} / {items.length}
          </Typography>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <IconButton
            onClick={onClose}
            aria-label="Close photo viewer"
            size="small"
            sx={{ color: "white", minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Image area with prev/next buttons */}
      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          bgcolor: "#111",
          height: "70vh",
          overflow: "hidden",
        }}>
        {/* Previous */}
        <IconButton
          onClick={() => navigate(Math.max(0, safeIndex - 1))}
          disabled={isFirst}
          aria-label="Previous photo"
          sx={{
            position: "absolute",
            left: 8,
            color: "white",
            bgcolor: "rgba(0,0,0,0.4)",
            minWidth: 44,
            minHeight: 44,
            zIndex: 1,
            "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
            "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
          }}>
          <ChevronLeftIcon />
        </IconButton>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}>
          <FullResImage item={item} blobUrl={blobUrls[item.mediaKey]} />
        </Box>

        {/* Next */}
        <IconButton
          onClick={() => navigate(Math.min(items.length - 1, safeIndex + 1))}
          disabled={isLast}
          aria-label="Next photo"
          sx={{
            position: "absolute",
            right: 8,
            color: "white",
            bgcolor: "rgba(0,0,0,0.4)",
            minWidth: 44,
            minHeight: 44,
            zIndex: 1,
            "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
            "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
          }}>
          <ChevronRightIcon />
        </IconButton>
      </DialogContent>

      {/* Footer bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.5,
          px: 2,
          py: 1.5,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}>
        {/* Metadata */}
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", flex: 1 }}>
          {item.resWidth && item.resHeight && (
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>
              {item.resWidth}×{item.resHeight}
            </Typography>
          )}
          {takenDate && (
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
              <span style={{ opacity: 0.6 }}>Taken </span>{takenDate}
            </Typography>
          )}
          {uploadedDate && (
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
              <span style={{ opacity: 0.6 }}>Uploaded </span>{uploadedDate}
            </Typography>
          )}
        </Box>

        {/* Keep/Trash chip */}
        {isKept ? (
          <Chip
            label="Keep"
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, borderColor: "rgba(99,179,237,0.8)", color: "rgba(99,179,237,1)" }}
          />
        ) : isGroupSelected ? (
          <Chip
            label="Trash"
            size="small"
            color="error"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, borderColor: "rgba(252,129,129,0.8)", color: "rgba(252,129,129,1)" }}
          />
        ) : null}

        {/* View in Google Photos link */}
        {item.productUrl && (
          <Link
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{
              color: "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              textDecoration: "none",
              "&:hover": { color: "white" },
            }}>
            View in Google Photos
            <OpenInNewIcon sx={{ fontSize: 12 }} />
          </Link>
        )}
      </Box>
    </Dialog>
  )
}
