import { useState, useEffect } from "react"

/**
 * Fetch a URL via fetch() (which uses extension host_permissions + cookies)
 * and return a blob URL that <img> can display. Revokes the blob URL on cleanup.
 */
export function useBlobUrl(url: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!url) return
    let revoked = false
    let objectUrl: string | undefined

    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !revoked) {
          objectUrl = URL.createObjectURL(blob)
          setBlobUrl(objectUrl)
        }
      })
      .catch(() => {})

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return blobUrl
}
