interface ActionBarProps {
  totalItems: number
  groupCount: number
  duplicateCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onTrash: () => void
  onRescan: () => void
}

export function ActionBar({
  totalItems,
  groupCount,
  duplicateCount,
  onSelectAll,
  onDeselectAll,
  onTrash,
  onRescan,
}: ActionBarProps) {
  return (
    <div style={styles.bar}>
      <div style={styles.stats}>
        <span>{totalItems.toLocaleString()} total items scanned</span>
        <span style={styles.separator}>|</span>
        <span>
          {groupCount} duplicate group{groupCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={styles.actions}>
        <button style={styles.textButton} onClick={onRescan}>
          Re-scan
        </button>
        {groupCount > 0 && (
          <>
            <button style={styles.textButton} onClick={onSelectAll}>
              Select All
            </button>
            <button style={styles.textButton} onClick={onDeselectAll}>
              Deselect All
            </button>
            <button
              style={{
                ...styles.trashButton,
                opacity: duplicateCount === 0 ? 0.5 : 1,
              }}
              onClick={onTrash}
              disabled={duplicateCount === 0}>
              Move {duplicateCount} Duplicate
              {duplicateCount !== 1 ? "s" : ""} to Trash
            </button>
          </>
        )}
      </div>
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
    position: "sticky",
    top: 0,
    backgroundColor: "white",
    zIndex: 10,
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
