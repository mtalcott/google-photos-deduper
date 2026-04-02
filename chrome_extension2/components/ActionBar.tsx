import { useState } from "react"
import type { GpdMediaItem, DuplicateGroup } from "../lib/types"

interface ActionBarProps {
  groups: DuplicateGroup[]
  mediaItems: Record<string, GpdMediaItem>
  onTrash: (dedupKeys: string[]) => void
  totalItems: number
}

export function ActionBar({
  groups,
  mediaItems,
  onTrash,
  totalItems,
}: ActionBarProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.id))
  )

  const duplicateCount = groups.reduce((sum, group) => {
    if (!selectedGroupIds.has(group.id)) return sum
    // Count all items except the original
    return sum + group.mediaKeys.filter((k) => k !== group.originalMediaKey).length
  }, 0)

  const handleSelectAll = () => {
    setSelectedGroupIds(new Set(groups.map((g) => g.id)))
  }

  const handleDeselectAll = () => {
    setSelectedGroupIds(new Set())
  }

  const handleTrash = () => {
    const dedupKeys: string[] = []
    for (const group of groups) {
      if (!selectedGroupIds.has(group.id)) continue
      for (const key of group.mediaKeys) {
        if (key === group.originalMediaKey) continue
        const item = mediaItems[key]
        if (item?.dedupKey) {
          dedupKeys.push(item.dedupKey)
        }
      }
    }
    if (dedupKeys.length > 0) {
      onTrash(dedupKeys)
    }
  }

  return (
    <div style={styles.bar}>
      <div style={styles.stats}>
        <span>
          {totalItems.toLocaleString()} total items scanned
        </span>
        <span style={styles.separator}>|</span>
        <span>
          {groups.length} duplicate group{groups.length !== 1 ? "s" : ""}
        </span>
      </div>

      {groups.length > 0 && (
        <div style={styles.actions}>
          <button style={styles.textButton} onClick={handleSelectAll}>
            Select All
          </button>
          <button style={styles.textButton} onClick={handleDeselectAll}>
            Deselect All
          </button>
          <button
            style={{
              ...styles.trashButton,
              opacity: duplicateCount === 0 ? 0.5 : 1,
            }}
            onClick={handleTrash}
            disabled={duplicateCount === 0}>
            Move {duplicateCount} Duplicate{duplicateCount !== 1 ? "s" : ""} to
            Trash
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #e0e0e0",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12,
  },
  stats: { fontSize: 14, color: "#5f6368" },
  separator: { margin: "0 8px" },
  actions: { display: "flex", gap: 8, alignItems: "center" },
  textButton: {
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    backgroundColor: "transparent",
    color: "#1a73e8",
    border: "1px solid #dadce0",
    borderRadius: 4,
    cursor: "pointer",
  },
  trashButton: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    backgroundColor: "#c62828",
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
}
