import { useState, useEffect } from "react"
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
    <img
      src={blobUrl || ""}
      alt={alt}
      style={styles.thumbnailImg}
      loading="lazy"
    />
  )
}

interface DuplicateGroupsProps {
  groups: DuplicateGroup[]
  mediaItems: Record<string, GpdMediaItem>
}

export function DuplicateGroups({ groups, mediaItems }: DuplicateGroupsProps) {
  if (groups.length === 0) {
    const totalItems = Object.keys(mediaItems).length
    return (
      <div style={styles.empty}>
        <h3>No duplicates found</h3>
        <p>
          Scanned {totalItems.toLocaleString()} items. No duplicate groups were
          detected at the current similarity threshold.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>
        {groups.length} Duplicate Group{groups.length !== 1 ? "s" : ""} Found
      </h3>

      {groups.map((group) => (
        <div key={group.id} style={styles.group}>
          <div style={styles.groupHeader}>
            <span style={styles.groupTitle}>
              Group: {group.mediaKeys.length} items
            </span>
            <span style={styles.similarity}>
              {Math.round(group.similarity * 100)}% similar
            </span>
          </div>
          <div style={styles.thumbnails}>
            {group.mediaKeys.map((key) => {
              const item = mediaItems[key]
              if (!item) return null
              const isOriginal = key === group.originalMediaKey
              return (
                <div
                  key={key}
                  style={{
                    ...styles.thumbnailCard,
                    border: isOriginal
                      ? "2px solid #1a73e8"
                      : "2px solid transparent",
                  }}>
                  <ThumbnailImage
                    src={item.thumb + "=w200-h200"}
                    alt={item.fileName || item.mediaKey}
                  />
                  <div style={styles.thumbnailInfo}>
                    <span style={styles.fileName}>
                      {item.fileName || "Untitled"}
                    </span>
                    {item.resWidth && item.resHeight && (
                      <span style={styles.dimensions}>
                        {item.resWidth}x{item.resHeight}
                      </span>
                    )}
                    {isOriginal && (
                      <span style={styles.originalBadge}>Original</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "0 0 48px" },
  empty: { textAlign: "center", padding: 48, color: "#5f6368" },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16 },
  group: {
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  groupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#f5f5f5",
  },
  groupTitle: { fontWeight: 500, fontSize: 14 },
  similarity: { fontSize: 13, color: "#5f6368" },
  thumbnails: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  thumbnailCard: {
    width: 160,
    borderRadius: 4,
    overflow: "hidden",
    cursor: "pointer",
  },
  thumbnailImg: {
    width: "100%",
    height: 120,
    objectFit: "cover",
    display: "block",
  },
  thumbnailInfo: {
    padding: "8px 8px 4px",
    fontSize: 12,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  fileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dimensions: { color: "#5f6368" },
  originalBadge: {
    display: "inline-block",
    backgroundColor: "#e8f0fe",
    color: "#1a73e8",
    padding: "2px 6px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 500,
    marginTop: 2,
  },
}
