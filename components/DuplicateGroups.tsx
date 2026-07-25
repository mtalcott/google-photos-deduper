import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import CardMedia from "@mui/material/CardMedia"
import Checkbox from "@mui/material/Checkbox"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"
import Typography from "@mui/material/Typography"
import OpenInFullIcon from "@mui/icons-material/OpenInFull"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff"
import VisibilityIcon from "@mui/icons-material/Visibility"
import { useBlobUrl } from "./useBlobUrl"
import { PhotoViewerModal } from "./PhotoViewerModal"
import type { GpdMediaItem, DuplicateGroup } from "../lib/types"
import { isGroupIgnored } from "../lib/duplicate-detector"

const PAGE_SIZE = 30

/**
 * Label a group as "videos", "photos", or "items" depending on the kinds of
 * media inside. Groups with both kinds (rare, only possible if a video's
 * poster happens to match a still) fall back to the neutral "items".
 */
function groupItemKind(
  group: DuplicateGroup,
  mediaItems: Record<string, GpdMediaItem>,
): string {
  let videos = 0
  let total = 0
  for (const key of group.mediaKeys) {
    const item = mediaItems[key]
    if (!item) continue
    total++
    if (item.duration) videos++
  }
  if (total === 0) return "items"
  if (videos === total) return total === 1 ? "video" : "videos"
  if (videos === 0) return total === 1 ? "photo" : "photos"
  return "items"
}

// ── Hoisted static sx objects ──────────────────────────────────────────
const sxPaperBase = { mb: 2, overflow: "hidden", borderRadius: 2, transition: "opacity 0.15s" }
const sxGroupHeader = {
  display: "flex",
  alignItems: "center",
  px: 1.5,
  py: 1,
  backgroundColor: "grey.50",
  borderBottom: "1px solid",
  borderColor: "divider",
  cursor: "pointer",
  userSelect: "none",
}
const sxCheckbox = { p: 0.5, mr: 0.5 }
const sxChipSimilarity = { fontSize: 11 }
const sxThumbnailsWrapper = { display: "flex", flexWrap: "wrap", gap: 1.5, p: 1.5 }
const sxItemWrapper = {
  position: "relative",
  flexShrink: 0,
  "& .viewer-btn": { opacity: 0 },
  "&:hover .viewer-btn": { opacity: 1 },
}
const sxCardBase = { width: "100%", transition: "border-color 0.15s" }
const sxCardContent = { p: 1, "&:last-child": { pb: 1 }, display: "flex", flexDirection: "column", gap: 0.5 }
const sxViewerBtn = {
  position: "absolute",
  top: 4,
  right: 4,
  bgcolor: "rgba(0,0,0,0.45)",
  color: "white",
  transition: "opacity 0.15s",
  minWidth: 32,
  minHeight: 32,
  "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
}
const sxOpenInFullIcon = { fontSize: 14 }
const sxStatusChip = { width: "fit-content", height: 20, fontSize: 11 }
// ──────────────────────────────────────────────────────────────────────

function ThumbnailImage({ src, alt, height, doNotCrop }: { src: string; alt: string; height: number; doNotCrop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const { blobUrl } = useBlobUrl(visible ? src : undefined)

  return (
    <div ref={ref}>
      {blobUrl ? (
        <CardMedia
          component="img"
          image={blobUrl}
          alt={alt}
          sx={{ height, width: doNotCrop ? "auto" : "100%", objectFit: doNotCrop ? "contain" : "cover" }}
        />
      ) : (
        <Skeleton variant="rectangular" height={height} sx={{ width: "100%" }} animation="wave" />
      )}
    </div>
  )
}

interface DuplicateGroupRowProps {
  group: DuplicateGroup
  mediaItems: Record<string, GpdMediaItem>
  isSelected: boolean
  keptSet: Set<string>
  onToggleGroup: (groupId: string) => void
  onToggleKept: (group: DuplicateGroup, mediaKey: string) => void
  onOpenViewer: (group: DuplicateGroup, index: number) => void
  onIgnoreGroup: (group: DuplicateGroup) => void
  ignoredSignatures?: string[]
  groupIndex: number
  totalGroups: number
  previewHeight: number
  previewWidth: number
  fetchHeight: number
  doNotCrop?: boolean
  hideMetadata?: boolean
}

const DuplicateGroupRow = memo(function DuplicateGroupRow({
  group,
  mediaItems,
  isSelected,
  keptSet,
  onToggleGroup,
  onToggleKept,
  onOpenViewer,
  onIgnoreGroup,
  ignoredSignatures,
  groupIndex,
  totalGroups,
  previewHeight,
  previewWidth,
  fetchHeight,
  doNotCrop,
  hideMetadata,
}: DuplicateGroupRowProps) {
  const isIgnored = isGroupIgnored(group, ignoredSignatures)
  return (
    <Paper
      variant="outlined"
      sx={[sxPaperBase, { opacity: isSelected ? 1 : 0.55 }]}>
      {/* Group header */}
      <Box
        onClick={() => onToggleGroup(group.id)}
        sx={[sxGroupHeader, isIgnored && { bgcolor: "action.hover", opacity: 0.8 }]}>
        <Checkbox
          size="small"
          checked={isSelected}
          disabled={isIgnored}
          onChange={() => onToggleGroup(group.id)}
          onClick={(e) => e.stopPropagation()}
          sx={sxCheckbox}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mr: 1, textDecoration: isIgnored ? "line-through" : "none", color: isIgnored ? "text.secondary" : "text.primary" }}>
          Group #{groupIndex + 1} of {totalGroups}
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mr: 0.75 }}>
          •
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>
          {group.mediaKeys.length} {groupItemKind(group, mediaItems)}
        </Typography>
        <Chip
          label={`${Math.round(group.similarity * 100)}% similar`}
          size="small"
          variant="outlined"
          sx={sxChipSimilarity}
        />
        <Button
          size="small"
          color={isIgnored ? "primary" : "inherit"}
          variant="text"
          startIcon={isIgnored ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
          onClick={(e) => {
            e.stopPropagation()
            onIgnoreGroup(group)
          }}
          sx={{ ml: 1, minWidth: 0, py: 0, px: 1, textTransform: "none", color: isIgnored ? "primary.main" : "text.secondary", "&:hover": { color: isIgnored ? "primary.dark" : "text.primary" } }}>
          {isIgnored ? "Un-ignore" : "Ignore"}
        </Button>
      </Box>

      {/* Thumbnails */}
      <Box sx={sxThumbnailsWrapper}>
        {group.mediaKeys.map((key, itemIndex) => {
          const item = mediaItems[key]
          if (!item) return null
          const isKept = keptSet.has(key)
          
          let itemWidth = previewWidth
          let itemHeight = previewHeight
          
          if (doNotCrop && item.resWidth && item.resHeight) {
            const aspect = item.resWidth / item.resHeight
            itemWidth = Math.round(previewHeight * aspect)
            if (itemWidth < previewWidth) {
              itemWidth = previewWidth
              itemHeight = Math.round(previewWidth / aspect)
            }
          }

          return (
            <Box key={key} sx={[sxItemWrapper, { width: itemWidth }]}>
              <Card
                variant="outlined"
                sx={[sxCardBase, {
                  borderColor: isKept ? "primary.main" : "error.light",
                  borderWidth: 2,
                }]}>
                <CardActionArea onClick={() => onToggleKept(group, key)}>
                  <Box sx={{ position: "relative" }}>
                    <ThumbnailImage
                      src={item.thumb + `=s${Math.max(itemWidth, itemHeight) * 2}`}
                      alt={item.fileName || item.mediaKey}
                      height={itemHeight}
                      doNotCrop={doNotCrop}
                    />
                  </Box>
                  <CardContent sx={sxCardContent}>
                    {!hideMetadata && (
                      <>
                        {item.fileName && (
                          <Typography
                            variant="caption"
                            display="block"
                            noWrap
                            title={item.fileName}>
                            {item.fileName}
                          </Typography>
                        )}
                        {item.resWidth && item.resHeight && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace" }}>
                            {item.resWidth}×{item.resHeight}
                          </Typography>
                        )}
                        {item.timestamp ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            <span style={{ opacity: 0.6 }}>Taken </span>
                            {new Date(item.timestamp).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </Typography>
                        ) : null}
                        {item.creationTimestamp ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            <span style={{ opacity: 0.6 }}>Uploaded </span>
                            {new Date(item.creationTimestamp).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </Typography>
                        ) : null}
                      </>
                    )}
                    {isKept ? (
                      <Chip
                        label="Keep"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={sxStatusChip}
                      />
                    ) : (
                      <Chip
                        label="Trash"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={sxStatusChip}
                      />
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>

              {/* Zoom overlay — secondary action, does not trigger Keep toggle */}
              <IconButton
                className="viewer-btn"
                size="small"
                aria-label="View full size"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenViewer(group, itemIndex)
                }}
                sx={sxViewerBtn}>
                <OpenInFullIcon sx={sxOpenInFullIcon} />
              </IconButton>
            </Box>
          )
        })}
      </Box>
    </Paper>
  )
})

interface DuplicateGroupsProps {
  groups: DuplicateGroup[]
  mediaItems: Record<string, GpdMediaItem>
  selectedGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void
  keptByGroupId: Map<string, Set<string>>
  onToggleKept: (group: DuplicateGroup, mediaKey: string) => void
  onIgnoreGroup: (group: DuplicateGroup) => void
  ignoredSignatures?: string[]
  previewSize?: "1x" | "1.5x" | "2x" | "3x"
  doNotCrop?: boolean
  hideMetadata?: boolean
}

export function DuplicateGroups({
  groups,
  mediaItems,
  selectedGroupIds,
  onToggleGroup,
  keptByGroupId,
  onToggleKept,
  onIgnoreGroup,
  ignoredSignatures = [],
  previewSize = "1x",
  doNotCrop = false,
  hideMetadata = false,
}: DuplicateGroupsProps) {
  // Map previewSize to fixed heights and widths (maintaining 4:3 ratio for the wrapper box)
  const heightMap = {
    "1x": 120,
    "1.5x": 180,
    "2x": 240,
    "3x": 360,
  }
  const previewHeight = heightMap[previewSize] || 120
  const previewWidth = Math.round(previewHeight * (160 / 120)) // 4:3 base ratio from original 160x120

  // We want to fetch a slightly larger thumbnail than what we display so it looks sharp
  // High-DPI screens need about 2x the physical pixels
  const fetchHeight = previewHeight * 2

  // Measure time from first non-empty groups render to commit
  const renderLoggedRef = useRef(false)
  const renderStartRef = useRef<number | null>(null)
  if (groups.length > 0 && !renderLoggedRef.current && renderStartRef.current === null) {
    renderStartRef.current = performance.now()
  }
  useEffect(() => {
    if (renderLoggedRef.current || renderStartRef.current === null || groups.length === 0) return
    renderLoggedRef.current = true
    const elapsed = performance.now() - renderStartRef.current
    const totalThumbnails = groups.reduce((s, g) => s + g.mediaKeys.length, 0)
    console.log(
      `[GPD perf] Results render: ${elapsed.toFixed(0)}ms for ${groups.length} groups, ${totalThumbnails} thumbnails`
    )
  })

  const [viewerState, setViewerState] = useState<{
    group: DuplicateGroup
    index: number
  } | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset pagination when groups change (new scan)
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [groups])

  // Infinite scroll: observe sentinel once per groups identity.
  // Functional setState needs no visibleCount in the closure.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE)
      },
      { rootMargin: "400px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [groups])

  const onOpenViewer = useCallback((group: DuplicateGroup, index: number) => {
    setViewerState({ group, index })
  }, [])

  const currentGroupIndex = useMemo(() => {
    return viewerState
      ? groups.findIndex((g) => g.id === viewerState.group.id)
      : -1
  }, [viewerState, groups])

  const handleNextGroup = useCallback(() => {
    if (currentGroupIndex !== -1 && currentGroupIndex < groups.length - 1) {
      setViewerState({ group: groups[currentGroupIndex + 1], index: 0 })
    }
  }, [currentGroupIndex, groups])

  const handlePrevGroup = useCallback(() => {
    if (currentGroupIndex > 0) {
      setViewerState({ group: groups[currentGroupIndex - 1], index: 0 })
    }
  }, [currentGroupIndex, groups])

  const viewerItems = useMemo(() => {
    if (!viewerState) return []
    return viewerState.group.mediaKeys
      .map((k) => mediaItems[k])
      .filter((item): item is GpdMediaItem => !!item)
  }, [viewerState, mediaItems])

  if (groups.length === 0) {
    const totalItems = Object.keys(mediaItems).length
    return (
      <Box sx={{ textAlign: "center", py: 8 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No duplicates found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Scanned {totalItems.toLocaleString()} items. No duplicate groups
          detected at the current similarity threshold.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="h6" fontWeight={600} sx={{ px: 0, py: 2 }}>
        {groups.length} Duplicate Group{groups.length !== 1 ? "s" : ""} Found
      </Typography>

      {groups.slice(0, visibleCount).map((group, index) => (
        <DuplicateGroupRow
          key={group.id}
          group={group}
          mediaItems={mediaItems}
          isSelected={selectedGroupIds.has(group.id)}
          keptSet={keptByGroupId.get(group.id)!}
          onToggleGroup={onToggleGroup}
          onToggleKept={onToggleKept}
          onOpenViewer={onOpenViewer}
          onIgnoreGroup={onIgnoreGroup}
          ignoredSignatures={ignoredSignatures}
          groupIndex={index}
          totalGroups={groups.length}
          previewHeight={previewHeight}
          previewWidth={previewWidth}
          fetchHeight={fetchHeight}
          doNotCrop={doNotCrop}
          hideMetadata={hideMetadata}
        />
      ))}

      {/* Infinite scroll sentinel */}
      {visibleCount < groups.length && <div ref={sentinelRef} />}

      {/* Photo viewer modal — rendered once outside the map, state drives which photo */}
      {viewerState && (
        <PhotoViewerModal
          open={true}
          items={viewerItems}
          initialIndex={viewerState.index}
          keptSet={keptByGroupId.get(viewerState.group.id)!}
          isGroupSelected={selectedGroupIds.has(viewerState.group.id)}
          onClose={() => setViewerState(null)}
          onToggleKept={(mediaKey) => onToggleKept(viewerState.group, mediaKey)}
          onToggleGroup={() => onToggleGroup(viewerState.group.id)}
          onNextGroup={handleNextGroup}
          onPrevGroup={handlePrevGroup}
        />
      )}
    </Box>
  )
}
