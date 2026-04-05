import { useState, useEffect } from "react"
import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import CardContent from "@mui/material/CardContent"
import CardMedia from "@mui/material/CardMedia"
import Checkbox from "@mui/material/Checkbox"
import Chip from "@mui/material/Chip"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import type { GpdMediaItem, DuplicateGroup } from "../lib/types"

/**
 * Fetch a thumbnail via fetch() (which uses extension host_permissions + cookies)
 * and return a blob URL that <img> can display.
 */
function useBlobUrl(url: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()
  useEffect(() => {
    if (!url) return
    let revoked = false
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !revoked) setBlobUrl(URL.createObjectURL(blob))
      })
      .catch(() => {})
    return () => {
      revoked = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [url])
  return blobUrl
}

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
  getOriginal: (group: DuplicateGroup) => string
  onSetOriginal: (groupId: string, mediaKey: string) => void
}

export function DuplicateGroups({
  groups,
  mediaItems,
  selectedGroupIds,
  onToggleGroup,
  getOriginal,
  onSetOriginal,
}: DuplicateGroupsProps) {
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

      {groups.map((group) => {
        const isSelected = selectedGroupIds.has(group.id)
        const original = getOriginal(group)

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
              {group.mediaKeys.map((key) => {
                const item = mediaItems[key]
                if (!item) return null
                const isOriginal = key === original

                return (
                  <Card
                    key={key}
                    variant="outlined"
                    sx={{
                      width: 160,
                      flexShrink: 0,
                      borderColor: isOriginal ? "primary.main" : "divider",
                      borderWidth: isOriginal ? 2 : 1,
                      transition: "border-color 0.15s",
                    }}>
                    <CardActionArea onClick={() => onSetOriginal(group.id, key)}>
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
                        <Typography
                          variant="caption"
                          display="block"
                          noWrap
                          title={item.fileName}>
                          {item.fileName ||
                            (item.timestamp
                              ? new Date(item.timestamp).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  }
                                )
                              : "Untitled")}
                        </Typography>
                        {item.resWidth && item.resHeight && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace" }}>
                            {item.resWidth}×{item.resHeight}
                          </Typography>
                        )}
                        {isOriginal ? (
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
                )
              })}
            </Box>
          </Paper>
        )
      })}
    </Box>
  )
}
