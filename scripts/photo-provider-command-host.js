// Shared MAIN-world command protocol for PhotoSweep provider adapters.
// Provider scripts keep their media behavior; this host owns the envelope and
// dispatch contract they all satisfy.

(() => {
  if (window.__GPD_COMMAND_HOST__) return

  const APP_ID = "GPD"

  function postResult(command, requestId, data) {
    window.postMessage(
      {
        app: APP_ID,
        action: "gptkResult",
        command,
        requestId,
        success: true,
        data
      },
      "*"
    )
  }

  function postError(command, requestId, error, data) {
    window.postMessage(
      {
        app: APP_ID,
        action: "gptkResult",
        command,
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ...(data !== undefined ? { data } : {})
      },
      "*"
    )
  }

  function postProgress(requestId, itemsProcessed, message, command, data) {
    window.postMessage(
      {
        app: APP_ID,
        action: "gptkProgress",
        requestId,
        itemsProcessed,
        message,
        ...(command !== undefined ? { command } : {}),
        ...(data !== undefined ? { data } : {})
      },
      "*"
    )
  }

  function register({ handlers, unsupportedMessage }) {
    window.addEventListener("message", async (event) => {
      if (event.source !== window) return
      const message = event.data
      if (message?.app !== APP_ID || message?.action !== "gptkCommand") return

      const { command, requestId, args } = message
      const handler = handlers[command]
      if (!handler) {
        postError(command, requestId, unsupportedMessage(command))
        return
      }
      try {
        await handler(requestId, args)
      } catch (error) {
        postError(command, requestId, error)
      }
    })
  }

  window.__GPD_COMMAND_HOST__ = Object.freeze({
    postResult,
    postError,
    postProgress,
    register
  })
})()
