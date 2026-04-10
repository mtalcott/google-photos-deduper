import { useState, useEffect } from "react"

/**
 * Fetch a URL via fetch() (which uses extension host_permissions + cookies)
 * and return a blob URL that <img> can display. Revokes the blob URL on cleanup.
 */
export function useBlobUrl(url: string | undefined): {
  blobUrl: string | undefined
  loading: boolean
} {
  const [blobUrl, setBlobUrl] = useState<string>()
  const [loading, setLoading] = useState(!!url)

  useEffect(() => {
    if (!url) {
      setLoading(false)
      return
    }
    let revoked = false
    let objectUrl: string | undefined

    setLoading(true)
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!revoked) {
          if (blob) {
            objectUrl = URL.createObjectURL(blob)
            setBlobUrl(objectUrl)
          }
          setLoading(false)
        }
      })
      .catch(() => {
        if (!revoked) setLoading(false)
      })

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return { blobUrl, loading }
}
