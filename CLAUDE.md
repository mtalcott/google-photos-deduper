# Project Notes for Claude

## Debugging the Extension

### Chrome DevTools MCP does NOT show extension pages

The `mcp__chrome-devtools__*` tools only see regular browser tabs (e.g. `https://...`).
Chrome extension pages (`chrome-extension://...`) — including the app tab, popup, and service worker — are **invisible** to the DevTools MCP.

**Use `tools/cdp.py` instead** for all interactions with extension pages:

```bash
# List all targets (includes extension pages and service workers)
python3 tools/cdp.py list

# Evaluate JS in an extension page
python3 tools/cdp.py eval <target_id> "document.title"

# Take a screenshot of the extension app tab
python3 tools/cdp.py screenshot <target_id> /tmp/ext.png

# Click an element
python3 tools/cdp.py click <target_id> "#some-button"
```

## Development

Always use dev mode — it watches for changes and rebuilds automatically to `build/chrome-mv3-dev`:

```bash
npm run dev
```

After a rebuild, reload the extension via the service worker target:

```bash
python3 tools/cdp.py eval <service_worker_target_id> "chrome.runtime.reload()"
```

Then reopen the app tab (it closes on reload):

```bash
python3 tools/cdp.py navigate <gp_tab_id> "chrome-extension://<ext_id>/tabs/app.html"
```

Do **not** use `npm run build` for development — that builds prod and overwrites dev.

---

Chrome must be running with remote debugging enabled on port 9222. If not started:
```bash
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\mackt\Chrome Profiles\chrome-debug" --no-first-run
```
