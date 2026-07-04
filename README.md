# PhotoSweep

[![CI Badge](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mtalcott/google-photos-deduper/actions/workflows/ci.yml?query=branch%3Amain)

A Chrome extension that finds duplicate photos in supported cloud photo libraries and moves reviewed duplicates to provider Trash where cleanup is supported.

Uses [Google Photos Toolkit (GPTK)](https://github.com/xob0t/Google-Photos-Toolkit) for Google Photos access, plus provider web sessions for supported iCloud Photos and Amazon Photos scans. Built with [Plasmo](https://plasmo.com/), [MediaPipe](https://developers.google.com/mediapipe), [React](https://react.dev/), and [MUI](https://mui.com/).

## Demo

[![Demo](https://google-photos-deduper-public.s3.amazonaws.com/demo-2026-l.webp?1)](https://youtu.be/SeOX98uTVwQ)

## Install

**[⬇ Download latest release](https://github.com/mtalcott/google-photos-deduper/releases/latest/download/google-photos-deduper.zip)**

1. Unzip to a permanent folder (don't delete it — Chrome needs it to stay there)
2. Open `chrome://extensions` → enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select the unzipped folder
4. Pin the extension icon in your toolbar for easy access

## Usage

1. Open Google Photos in Chrome with the extension installed
2. Click the extension icon → **Open PhotoSweep**
3. Start with a scoped scan: choose a small album, month, or year before scanning a large library
4. Review each duplicate group, choose which item or items to keep, and skip any uncertain group
5. Export the JSON or CSV review report before moving anything to Trash
6. Click **Move to Trash**, read the confirmation, type the exact item count, and confirm
7. Check the Trash result report, then restore from provider Trash if anything looks wrong

No OAuth setup. No Google Cloud project. Your photos are analyzed in your browser and never uploaded.

## Safety Model

- Review-first workflow: the extension recommends keep items, but does not permanently delete photos or auto-delete entire groups.
- Scoped scans: scan by album or taken-date range so large libraries can be processed in small sessions.
- Resume support: interrupted scans can resume from checkpointed media lists or cached embeddings.
- Local cache: embeddings and metadata snapshots stay in Chrome extension storage and can be cleared or rebuilt.
- Explainable groups: exact and similar duplicate groups are separated, with similarity and match reasons shown in the review UI.
- Audit exports: JSON and CSV reports include kept items, Trash candidates, reasons, timestamps, links, and storage metadata when available.
- Conservative Trash: where supported, items are moved to provider Trash in small batches with retry/backoff, typed count confirmation, result reporting, and an in-app undo path.
- Local-first packaging: image embeddings run in the browser using the bundled MediaPipe model and WASM assets; there is no photo-analysis backend.

## Recommended Large-Library Flow

For a library around 20k photos, avoid starting with an unscoped full-library comparison.

1. Scan one year, month, or small album in **Smart** mode.
2. Review and Trash only obvious exact duplicates.
3. Export and keep the pre-Trash report.
4. Confirm that the Trash result report shows the expected moved items.
5. Restore a test item from Trash before using the workflow on larger batches.
6. Re-run the same scope in balanced or broader settings only after the strict pass looks correct.
7. Move to the next scoped period.

## Validation Status

The automated suite covers scan setup, duplicate grouping, review behavior, checkpoint/resume, cache diagnostics, report generation, conservative Trash batching, typed confirmation, result reporting, and undo using local and stubbed Google Photos fixtures.

Before using this on a main account, run the live checklist in [VALIDATION.md](VALIDATION.md). A build is not considered production-validated until a tiny live album scan, controlled Trash move, report review, and restore-from-Trash check have passed.

Paid launch readiness is tracked in [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

## Development

### Setup

**Prerequisites:** Google Chrome, Node.js 24

```bash
git clone https://github.com/mtalcott/google-photos-deduper.git
cd google-photos-deduper
git submodule update --init --recursive
npm install
npm run dev  # builds into build/chrome-mv3-dev/
```

Load in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `build/chrome-mv3-dev/`.

### Commands

```bash
# Start the Plasmo dev server (rebuilds on file changes)
npm run dev

# Build the Chrome extension (builds into build/chrome-mv3-prod/)
npm run build

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
  --user-data-dir="$HOME/chrome-debug" \
  --disable-extensions-except="$PWD/build/chrome-mv3-dev" \
  --load-extension="$PWD/build/chrome-mv3-dev"
```

**Windows [WSL](https://learn.microsoft.com/en-us/windows/wsl/):**

```bash
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="C:\Users\<you>\Chrome Profiles\chrome-debug" \
  --disable-extensions-except="/path/to/build/chrome-mv3-dev" \
  --load-extension="/path/to/build/chrome-mv3-dev"
```

Then run: `npm run test:e2e`

If Chrome is already running or does not accept the CDP extension flags, let
Playwright launch an existing logged-in profile with the extension loaded:

```bash
GPD_E2E_USER_DATA_DIR=".chrome-live-validation" npm run test:e2e
```

By default, the live scan test uses today's date as a narrow scope. For a deliberate validation run, set an album or date range:

```bash
GPD_E2E_ALBUM_TITLE="Tiny duplicate test" npm run test:e2e
GPD_E2E_DATE_FROM="2026-01-01" GPD_E2E_DATE_TO="2026-01-31" npm run test:e2e
```

The live Trash test is disabled unless explicitly enabled:

```bash
GPD_E2E_ALBUM_TITLE="Tiny duplicate test" GPD_E2E_ALLOW_TRASH=1 npm run test:e2e
```

## Motivation

Google deprecated the Photos Library API's write access in 2025, and duplicate detection has never been a built-in Google Photos feature. This extension uses [@xob0t](https://github.com/xob0t)'s [Google Photos Toolkit (GPTK)](https://github.com/xob0t/Google-Photos-Toolkit) — an open-source wrapper around Google Photos' undocumented web API — to access your library without OAuth, and runs MediaPipe's MobileNet V3 image embedder locally to find visually identical photos.

## Support

For paid license, refund, privacy, or deletion requests, email `pawsitivegames@gmail.com`.

Found a bug or have a feature request? [Open an issue](https://github.com/mtalcott/google-photos-deduper/issues/new/choose).

Have questions? [Post on the discussions page](https://github.com/mtalcott/google-photos-deduper/discussions).

## Say Thanks

If you found this project useful, give it a star!
