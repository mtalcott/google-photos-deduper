import { useState, useRef, useEffect } from "react"
import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import CardMedia from "@mui/material/CardMedia"
import Checkbox from "@mui/material/Checkbox"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import OpenInFullIcon from "@mui/icons-material/OpenInFull"
import { useBlobUrl } from "./useBlobUrl"
import { PhotoViewerModal } from "./PhotoViewerModal"
import type { GpdMediaItem, DuplicateGroup } from "../lib/types"

function ThumbnailImage({ src, alt }: { src: string; alt: string }) {
  const blobUrl = useBlobUrl(src)
  return (
    <CardMedia
      component="img"
      image={blobUrl || ""}
      alt={alt}
      sx={{ height: 120, objectFit: "cover" }}
    />
  )
}

interface DuplicateGroupsProps {
  groups: DuplicateGroup[]
  mediaItems: Record<string, GpdMediaItem>
  selectedGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void
  getKept: (group: DuplicateGroup) => Set<string>
  onToggleKept: (group: DuplicateGroup, mediaKey: string) => void
}

export function DuplicateGroups({
  groups,
  mediaItems,
  selectedGroupIds,
  onToggleGroup,
  getKept,
  onToggleKept,
}: DuplicateGroupsProps) {
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

  const viewerGroup = viewerState?.group ?? null
  const viewerItems = viewerGroup
    ? viewerGroup.mediaKeys
        .map((k) => mediaItems[k])
        .filter((item): item is GpdMediaItem => !!item)
    : []

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="h6" fontWeight={600} sx={{ px: 0, py: 2 }}>
        {groups.length} Duplicate Group{groups.length !== 1 ? "s" : ""} Found
      </Typography>

      {groups.map((group) => {
        const isSelected = selectedGroupIds.has(group.id)
        const keptSet = getKept(group)

        return (
          <Paper
            key={group.id}
            variant="outlined"
            sx={{
              mb: 2,
              overflow: "hidden",
              borderRadius: 2,
              opacity: isSelected ? 1 : 0.55,
              transition: "opacity 0.15s",
            }}>
            {/* Group header */}
            <Box
              onClick={() => onToggleGroup(group.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                px: 1.5,
                py: 1,
                backgroundColor: "grey.50",
                borderBottom: "1px solid",
                borderColor: "divider",
                cursor: "pointer",
                userSelect: "none",
              }}>
              <Checkbox
                size="small"
                checked={isSelected}
                onChange={() => onToggleGroup(group.id)}
                onClick={(e) => e.stopPropagation()}
                sx={{ p: 0.5, mr: 0.5 }}
              />
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                {group.mediaKeys.length} photos
              </Typography>
              <Chip
                label={`${Math.round(group.similarity * 100)}% similar`}
                size="small"
                variant="outlined"
                sx={{ fontSize: 11 }}
              />
            </Box>

            {/* Thumbnails */}
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1.5,
                p: 1.5,
              }}>
              {group.mediaKeys.map((key, itemIndex) => {
                const item = mediaItems[key]
                if (!item) return null
                const isKept = keptSet.has(key)

                return (
                  <Box
                    key={key}
                    sx={{
                      position: "relative",
                      width: 160,
                      flexShrink: 0,
                      "& .viewer-btn": { opacity: 0 },
                      "&:hover .viewer-btn": { opacity: 1 },
                    }}>
                    <Card
                      variant="outlined"
                      sx={{
                        width: "100%",
                        borderColor: isKept ? "primary.main" : "divider",
                        borderWidth: isKept ? 2 : 1,
                        transition: "border-color 0.15s",
                      }}>
                      <CardActionArea onClick={() => onToggleKept(group, key)}>
                        <ThumbnailImage
                          src={item.thumb + "=w200-h200"}
                          alt={item.fileName || item.mediaKey}
                        />
                        <CardContent
                          sx={{
                            p: 1,
                            "&:last-child": { pb: 1 },
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                          }}>
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
                          {isKept ? (
                            <Chip
                              label="Keep"
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ width: "fit-content", height: 20, fontSize: 11 }}
                            />
                          ) : isSelected ? (
                            <Chip
                              label="Trash"
                              size="small"
                              color="error"
                              variant="outlined"
                              sx={{ width: "fit-content", height: 20, fontSize: 11 }}
                            />
                          ) : null}
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
                        setViewerState({ group, index: itemIndex })
                      }}
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        bgcolor: "rgba(0,0,0,0.45)",
                        color: "white",
                        transition: "opacity 0.15s",
                        minWidth: 32,
                        minHeight: 32,
                        "&:hover": { bgcolor: "rgba(0,0,0,0.65)" },
                      }}>
                      <OpenInFullIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                )
              })}
            </Box>
          </Paper>
        )
      })}

      {/* Photo viewer modal — rendered once outside the map, state drives which photo */}
      {viewerGroup && (
        <PhotoViewerModal
          open={true}
          items={viewerItems}
          initialIndex={viewerState!.index}
          keptSet={getKept(viewerGroup)}
          isGroupSelected={selectedGroupIds.has(viewerGroup.id)}
          onClose={() => setViewerState(null)}
        />
      )}
    </Box>
  )
}

