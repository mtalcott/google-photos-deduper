import type { ScanSettings } from "../lib/types"

interface ScanConfigProps {
  settings: ScanSettings
  onSettingsChange: (settings: Partial<ScanSettings>) => void
  onStartScan: () => void
  hasGptk: boolean
}

export function ScanConfig({
  settings,
  onSettingsChange,
  onStartScan,
  hasGptk,
}: ScanConfigProps) {
  if (!hasGptk) {
    return (
      <div style={styles.container}>
        <div style={styles.warning}>
          <p>
            GPTK is not loaded on the Google Photos page. Please reload
            photos.google.com and try again.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Scan for Duplicates</h2>
      <p style={styles.description}>
        Scan your Google Photos library to find duplicate images using AI-powered
        image comparison.
      </p>

      <div style={styles.field}>
        <label style={styles.label}>
          Similarity Threshold: {settings.similarityThreshold}
        </label>
        <input
          type="range"
          min={0.9}
          max={1.0}
          step={0.01}
          value={settings.similarityThreshold}
          onChange={(e) =>
            onSettingsChange({
              similarityThreshold: parseFloat(e.target.value),
            })
          }
          style={styles.slider}
        />
        <div style={styles.sliderLabels}>
          <span>More matches</span>
          <span>Exact only</span>
        </div>
      </div>

      <button style={styles.button} onClick={onStartScan}>
        Scan Library
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 480, margin: "0 auto", padding: 24 },
  heading: { fontSize: 20, fontWeight: 600, marginBottom: 8 },
  description: { color: "#5f6368", marginBottom: 24, lineHeight: 1.5 },
  field: { marginBottom: 24 },
  label: { display: "block", marginBottom: 8, fontWeight: 500 },
  slider: { width: "100%" },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#5f6368",
    marginTop: 4,
  },
  button: {
    padding: "12px 32px",
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: "#1a73e8",
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    width: "100%",
  },
  warning: {
    backgroundColor: "#fff3e0",
    border: "1px solid #ff9800",
    borderRadius: 4,
    padding: 16,
    color: "#e65100",
  },
}
