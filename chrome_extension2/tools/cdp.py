#!/usr/bin/env python3
"""Minimal CDP client for interacting with Chrome extension pages.

Usage:
  python3 cdp.py list                          # List all targets
  python3 cdp.py eval <target_id> <js_expr>    # Evaluate JS expression
  python3 cdp.py click <target_id> <selector>  # Click an element
  python3 cdp.py screenshot <target_id> [file] # Take screenshot
  python3 cdp.py navigate <target_id> <url>    # Navigate target
  python3 cdp.py reload <target_id>            # Reload target
"""

import asyncio
import base64
import json
import sys

import websockets

CDP_HOST = "localhost"
CDP_PORT = 9222
MSG_ID = 0


def next_id():
    global MSG_ID
    MSG_ID += 1
    return MSG_ID


async def get_targets():
    """List all CDP targets."""
    import urllib.request
    with urllib.request.urlopen(f"http://{CDP_HOST}:{CDP_PORT}/json/list") as r:
        return json.loads(r.read())


async def send_command(ws_url: str, method: str, params=None, timeout: float = 30):
    """Send a CDP command and return the result."""
    async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
        msg_id = next_id()
        cmd = {"id": msg_id, "method": method, "params": params or {}}
        await ws.send(json.dumps(cmd))

        # Wait for our response (skip events)
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                raise TimeoutError(f"Timeout waiting for CDP response to {method}")
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            data = json.loads(raw)
            if data.get("id") == msg_id:
                if "error" in data:
                    raise RuntimeError(f"CDP error: {data['error']}")
                return data.get("result", {})


async def evaluate(target_id: str, expression: str):
    """Evaluate a JS expression on a target."""
    targets = await get_targets()
    target = next((t for t in targets if t["id"].startswith(target_id) or target_id.startswith(t["id"])), None)
    if not target:
        print(f"Target {target_id} not found")
        return
    ws_url = target["webSocketDebuggerUrl"]
    result = await send_command(ws_url, "Runtime.evaluate", {
        "expression": expression,
        "returnByValue": True,
        "awaitPromise": True,
    })
    val = result.get("result", {})
    if val.get("type") == "undefined":
        print("undefined")
    elif "value" in val:
        print(json.dumps(val["value"], indent=2) if isinstance(val["value"], (dict, list)) else val["value"])
    else:
        print(json.dumps(val, indent=2))
    if result.get("exceptionDetails"):
        print(f"Exception: {result['exceptionDetails']}", file=sys.stderr)


async def click(target_id: str, selector: str):
    """Click an element by CSS selector."""
    targets = await get_targets()
    target = next((t for t in targets if t["id"].startswith(target_id) or target_id.startswith(t["id"])), None)
    if not target:
        print(f"Target {target_id} not found")
        return
    ws_url = target["webSocketDebuggerUrl"]

    # Get element position
    result = await send_command(ws_url, "Runtime.evaluate", {
        "expression": f"""
            (() => {{
                const el = document.querySelector({json.dumps(selector)});
                if (!el) return {{ error: 'Element not found: {selector}' }};
                const rect = el.getBoundingClientRect();
                return {{ x: rect.x + rect.width/2, y: rect.y + rect.height/2, found: true }};
            }})()
        """,
        "returnByValue": True,
    })
    pos = result.get("result", {}).get("value", {})
    if not pos or pos.get("error"):
        print(pos.get("error", "Could not find element"))
        return

    # Dispatch click
    for event_type in ["mousePressed", "mouseReleased"]:
        await send_command(ws_url, "Input.dispatchMouseEvent", {
            "type": event_type,
            "x": pos["x"],
            "y": pos["y"],
            "button": "left",
            "clickCount": 1,
        })
    print(f"Clicked {selector} at ({pos['x']:.0f}, {pos['y']:.0f})")


async def screenshot(target_id: str, filepath: str = "/tmp/cdp_screenshot.png"):
    """Take a screenshot of a target."""
    targets = await get_targets()
    target = next((t for t in targets if t["id"].startswith(target_id) or target_id.startswith(t["id"])), None)
    if not target:
        print(f"Target {target_id} not found")
        return
    ws_url = target["webSocketDebuggerUrl"]
    result = await send_command(ws_url, "Page.captureScreenshot", {"format": "png"})
    data = base64.b64decode(result["data"])
    with open(filepath, "wb") as f:
        f.write(data)
    print(f"Screenshot saved to {filepath} ({len(data)} bytes)")


async def navigate(target_id: str, url: str):
    """Navigate a target to a URL."""
    targets = await get_targets()
    target = next((t for t in targets if t["id"].startswith(target_id) or target_id.startswith(t["id"])), None)
    if not target:
        print(f"Target {target_id} not found")
        return
    ws_url = target["webSocketDebuggerUrl"]
    result = await send_command(ws_url, "Page.navigate", {"url": url})
    print(f"Navigated to {url}: {result}")


async def reload(target_id: str):
    """Reload a target."""
    targets = await get_targets()
    target = next((t for t in targets if t["id"].startswith(target_id) or target_id.startswith(t["id"])), None)
    if not target:
        print(f"Target {target_id} not found")
        return
    ws_url = target["webSocketDebuggerUrl"]
    await send_command(ws_url, "Page.reload")
    print("Reloaded")


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]

    if cmd == "list":
        targets = await get_targets()
        for t in targets:
            print(f"{t['id'][:12]}  {t['type']:15s}  {t['url'][:100]}")

    elif cmd == "eval" and len(sys.argv) >= 4:
        await evaluate(sys.argv[2], sys.argv[3])

    elif cmd == "click" and len(sys.argv) >= 4:
        await click(sys.argv[2], sys.argv[3])

    elif cmd == "screenshot":
        tid = sys.argv[2] if len(sys.argv) >= 3 else None
        fp = sys.argv[3] if len(sys.argv) >= 4 else "/tmp/cdp_screenshot.png"
        if not tid:
            print("Usage: cdp.py screenshot <target_id> [filepath]")
            return
        await screenshot(tid, fp)

    elif cmd == "navigate" and len(sys.argv) >= 4:
        await navigate(sys.argv[2], sys.argv[3])

    elif cmd == "reload" and len(sys.argv) >= 3:
        await reload(sys.argv[2])

    else:
        print(__doc__)


if __name__ == "__main__":
    asyncio.run(main())
