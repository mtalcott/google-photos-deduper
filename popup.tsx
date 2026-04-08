import { useEffect, useState } from "react"

function IndexPopup() {
  const [scanInfo, setScanInfo] = useState<{
    groupCount: number
    scanDate: number
  } | null>(null)

  useEffect(() => {
    chrome.storage.local.get(["scanResults"], (result) => {
      const r = result.scanResults
      if (r?.groups?.length) {
        setScanInfo({ groupCount: r.groups.length, scanDate: r.scanDate })
      }
    })
  }, [])

  const handleOpen = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/app.html") })
    window.close()
  }

  const scanDate = scanInfo
    ? new Date(scanInfo.scanDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null

  return (
    <div style={{ padding: 16, width: 240, fontFamily: "Roboto, sans-serif" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>
        Google Photos Deduper
      </h3>
      {scanInfo ? (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#5f6368" }}>
          Last scan ({scanDate}): {scanInfo.groupCount} duplicate group
          {scanInfo.groupCount !== 1 ? "s" : ""} found
        </p>
      ) : (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#5f6368" }}>
          Find and remove duplicate photos from your Google Photos library.
        </p>
      )}
      <button
        onClick={handleOpen}
        style={{
          width: "100%",
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 500,
          backgroundColor: "#1565C0",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}>
        {scanInfo ? "View Results" : "Open Deduper"}
      </button>
    </div>
  )
}

export default IndexPopup
