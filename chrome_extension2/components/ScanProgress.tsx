import type { ScanPhase } from "../lib/types"

interface ScanProgressProps {
  phase: ScanPhase
  itemsProcessed: number
  totalEstimate: number
  message: string
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  fetching: "Fetching media items",
  downloading_thumbnails: "Downloading thumbnails",
  computing_embeddings: "Computing image embeddings",
  grouping: "Grouping duplicates",
  complete: "Complete",
}

export function ScanProgress({
  phase,
  itemsProcessed,
  totalEstimate,
  message,
}: ScanProgressProps) {
  const progress =
    totalEstimate > 0 ? Math.round((itemsProcessed / totalEstimate) * 100) : 0

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Scanning Library</h2>

      <div style={styles.phaseIndicator}>
        <span style={styles.phaseLabel}>{PHASE_LABELS[phase]}</span>
      </div>

      <div style={styles.progressBar}>
        <div
          style={{
            ...styles.progressFill,
            width: totalEstimate > 0 ? `${progress}%` : "100%",
            animation:
              totalEstimate === 0 ? "indeterminate 1.5s infinite ease-in-out" : undefined,
          }}
        />
      </div>

      <div style={styles.stats}>
        <span>
          {itemsProcessed.toLocaleString()} items processed
          {totalEstimate > 0 && ` / ${totalEstimate.toLocaleString()}`}
        </span>
        {totalEstimate > 0 && <span>{progress}%</span>}
      </div>

      <p style={styles.message}>{message}</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 480, margin: "0 auto", padding: 24 },
  heading: { fontSize: 20, fontWeight: 600, marginBottom: 16 },
  phaseIndicator: { marginBottom: 16 },
  phaseLabel: { fontSize: 14, color: "#5f6368", fontWeight: 500 },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1a73e8",
    borderRadius: 4,
    transition: "width 0.3s ease",
  },
  stats: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#5f6368",
    marginBottom: 16,
  },
  message: { fontSize: 13, color: "#5f6368", fontStyle: "italic" },
}
