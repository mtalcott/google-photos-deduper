# Google Photos Deduper

[![CI Badge](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml?query=branch%3Amain)

A Chrome extension that finds and removes duplicate photos from your Google Photos library.

Built with [Plasmo](https://plasmo.com/), [MediaPipe](https://developers.google.com/mediapipe), [React](https://react.dev/), and [MUI](https://mui.com/). Uses [Google Photos Toolkit (GPTK)](https://github.com/xob0t/Google-Photos-Toolkit) to access your library via Google Photos' web interface.

## How It Works

1. Open Google Photos in Chrome with the extension installed
2. Click the extension icon → **Open Deduper**
3. Click **Scan Library** - the extension fetches your media items and uses MediaPipe image embeddings locally to find visually identical photos
4. Review the duplicate groups, select which to keep, and click **Move to Trash**

No OAuth setup. No Google Cloud project. No data leaves your browser.

## Demo

[![Demo](https://google-photos-deduper-public.s3.amazonaws.com/demo-l.gif)](https://youtu.be/QDUGKgQOa7o)

## Install

1. Go to [Releases](../../releases/latest) and download the latest `google-photos-deduper-vX.X.X.zip`
2. Unzip the file to a permanent folder (don't delete it — Chrome needs it to stay there)
3. Open Chrome → Extensions (`chrome://extensions`)
4. Enable **Developer mode** (toggle, top-right)
5. Click **Load unpacked** → select the unzipped folder
6. The extension icon appears in your toolbar — pin it for easy access

## Development

### Setup

**Prerequisites:** Google Chrome, Node.js 20+

```bash
git clone https://github.com/mtalcott/google-photos-deduper.git
cd google-photos-deduper
git submodule update --init --recursive
npm install
npm run build  # builds into build/chrome-mv3-dev/
```

Load in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `build/chrome-mv3-dev/`.

### Commands

```bash
# Start the Plasmo dev server (rebuilds on file changes)
npm run dev

# Run unit and integration tests
npm test

# Run full E2E tests (requires Chrome with remote debugging — see below)
npm run test:e2e
```

### Full E2E Tests

Full E2E tests connect to a running Chrome instance via the [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/). Start Chrome with remote debugging before running:

**macOS:**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug"
```

**[WSL](https://learn.microsoft.com/en-us/windows/wsl/):**
```bash
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="C:\Users\<you>\Chrome Profiles\chrome-debug"
```

Then run: `npm run test:e2e`

## Motivation

Google deprecated the Photos Library API's write access in 2025, and duplicate detection has never been a built-in Google Photos feature. This extension uses GPTK — an open-source wrapper around Google Photos' undocumented web API — to access your library without OAuth, and runs MediaPipe's MobileNet V3 image embedder locally to find visually identical photos.

## Support

Found a bug or have a feature request? [Open an issue](https://github.com/mtalcott/google-photos-deduper/issues/new/choose).

Have questions? [Post on the discussions page](https://github.com/mtalcott/google-photos-deduper/discussions).

## Say Thanks

If you found this project useful, give it a star!
