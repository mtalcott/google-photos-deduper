# Google Photos Deduper

[![CI](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml?query=branch%3Amain)

A Chrome extension that finds and removes duplicate photos from your Google Photos library. No backend, no API keys, no Docker — runs entirely in your browser.

Built with [Plasmo](https://plasmo.com/), [MediaPipe](https://developers.google.com/mediapipe), [React](https://react.dev/), and [MUI](https://mui.com/). Uses [Google Photos Toolkit (GPTK)](https://github.com/GooglePhotosToolkit/google-photos-toolkit) to access your library via Google Photos' web interface.

## How It Works

1. Open Google Photos in Chrome with the extension installed
2. Click the extension icon → **Open Deduper**
3. Click **Scan Library** — the extension fetches your media items and runs MediaPipe image embeddings locally to find visually identical photos
4. Review the duplicate groups, select which to keep, and click **Move to Trash**

No OAuth setup. No Google Cloud project. No data leaves your browser.

## Setup

### Prerequisites

- Google Chrome
- Node.js 20+

### Install

```bash
git clone https://github.com/mtalcott/google-photos-deduper.git
cd google-photos-deduper
git submodule update --init --recursive
npm install
```

### Build

```bash
npm run build
```

This builds GPTK (the Google Photos API wrapper) and then the extension into `build/chrome-mv3-dev/`.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `build/chrome-mv3-dev/` folder

### Use

1. Open [Google Photos](https://photos.google.com) in Chrome and make sure you're logged in
2. Click the **Google Photos Deduper** extension icon
3. Click **Open Deduper**
4. Click **Scan Library** and wait for the scan to complete (time varies by library size)
5. Review duplicate groups, then click **Move to Trash** to remove the duplicates

## Development

```bash
# Start the Plasmo dev server (rebuilds on file changes)
npm run dev

# Run unit and integration tests
npm test

# Run full E2E tests (requires Chrome with remote debugging — see below)
npm run test:e2e
```

### Full E2E Tests

Full E2E tests connect to a running Chrome instance via CDP to avoid Google session invalidation. Start Chrome with remote debugging before running:

**WSL:**
```bash
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="C:\Users\<you>\Chrome Profiles\chrome-debug"
```

Then run: `npm run test:e2e`

### Project Structure

```
background/         Service worker — message routing, tab management
components/         React UI components
contents/           Content scripts (GPTK injection, message bridge)
lib/                Shared logic (types, app state reducer, duplicate detector)
scripts/            MAIN world command handler (calls gptkApi)
tabs/               Extension tab pages (app.html — main UI)
popup.tsx           Extension popup
tests/              Vitest unit tests + Playwright E2E tests
Google-Photos-Toolkit/  GPTK submodule
```

## Motivation

Google deprecated the Photos Library API's write access in 2025, and duplicate detection has never been a built-in Google Photos feature. This extension uses GPTK — an open-source wrapper around Google Photos' undocumented web API — to access your library without OAuth, and runs MediaPipe's MobileNet V3 image embedder locally to find visually identical photos.

## Support

Found a bug or have a feature request? [Open an issue](https://github.com/mtalcott/google-photos-deduper/issues/new/choose).

Have questions? [Post on the discussions page](https://github.com/mtalcott/google-photos-deduper/discussions).

## Say Thanks

If you found this project useful, give it a star!
