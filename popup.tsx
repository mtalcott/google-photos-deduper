function IndexPopup() {
  const handleOpen = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("tabs/app.html"),
    })
    window.close()
  }

  return (
    <div style={{ padding: 16, width: 240, fontFamily: "sans-serif" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
        Google Photos Deduper
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5f6368" }}>
        Find and remove duplicate photos from your Google Photos library.
      </p>
      <button
        onClick={handleOpen}
        style={{
          width: "100%",
          padding: "10px 16px",
          fontSize: 13,
          fontWeight: 500,
          backgroundColor: "#1a73e8",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
        }}>
        Open Deduper
      </button>
    </div>
  )
}

export default IndexPopup
