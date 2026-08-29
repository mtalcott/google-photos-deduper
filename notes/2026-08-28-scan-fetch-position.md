# Showing how far back the fetch has reached

*2026-08-29T03:47:37Z by Showboat 0.6.1*
<!-- showboat-id: 8a9affe7-ea64-4c2c-94ff-00cdf608e554 -->

## What was already there

`ScanProgress` already rendered a live item count during the fetch phase, fed by
`postProgress(requestId, mediaItems.length, ...)` in `getAllMediaItems`. So
'show the current mediaItems size' needed no work.

## What was missing

Where in time the fetch has reached. A 100k-item library is roughly 400
sequential pages; a climbing number alone says nothing about how much is left.

## Which date to show

Pagination uses `gptkApi.getItemsByUploadedDate`, newest-first **by upload
date**. So the upload date of the last item on each page walks backwards
monotonically and is the honest position indicator. The taken date does not — a
photo uploaded yesterday may have been taken decades ago — so it is shown
alongside rather than used as the position.

Zero and non-finite timestamps are filtered at the source. Real libraries
contain items with no usable date, and they would otherwise render as
1 Jan 1970.

```bash
sed -n '/Report how far back/,/^      )$/p' scripts/google-photos-commands.js
```

```output
      // Report how far back the fetch has reached. Items arrive newest-first by
      // upload date, so the last item of the page is the oldest seen so far.
      // Only finite, non-zero values are sent — some items carry no usable date
      // and would otherwise render as 1 Jan 1970.
      const oldest = mediaItems[mediaItems.length - 1]
      const position = {}
      if (oldest) {
        if (Number.isFinite(oldest.creationTimestamp) && oldest.creationTimestamp > 0)
          position.oldestUploadedAt = oldest.creationTimestamp
        if (Number.isFinite(oldest.timestamp) && oldest.timestamp > 0)
          position.oldestTakenAt = oldest.timestamp
      }

      postProgress(
        requestId,
        mediaItems.length,
        `Fetched ${mediaItems.length} items`,
        undefined,
        position
      )
```

## Rendered output

The real `ScanProgress` component rendered with `renderToStaticMarkup`, tags
stripped, to show the exact copy a user sees. Harness is throwaway and lives
outside the repo, so this block will not reproduce on a later `showboat verify`.

```bash
node /private/tmp/claude-501/-Users-yakovv-marina-work-deduper/41396d94-0894-44a5-90dd-b4886ea0e177/scratchpad/render/out.cjs
```

```output

--- mid-fetch, both dates present ---
Scanning Library  ·  Fetching media items  ·  Step 1 of 4  ·  24,300 items processed  ·  Reached uploads from Mar 12, 2023 (taken Jul 4, 2019)

--- mid-fetch, taken date missing ---
Scanning Library  ·  Fetching media items  ·  Step 1 of 4  ·  24,300 items processed  ·  Reached uploads from Mar 12, 2023

--- first page not yet returned ---
Scanning Library  ·  Fetching media items  ·  Step 1 of 4  ·  0 items processed

--- later phase: position suppressed ---
Scanning Library  ·  Computing image similarity  ·  Step 3 of 4  ·  500 items processed

```

## Tests

15 new tests (263 total, up from 248). The four covering
`scripts/google-photos-commands.js` were written after the implementation, so
they were verified red by reverting the script to HEAD and re-running: 3 of 4
failed, the fourth asserts absence and passes either way.

```bash
npx tsc --noEmit -p tsconfig.json && echo 'typecheck: clean' && npm test 2>&1 | tail -5
```

```output
typecheck: clean
 Test Files  13 passed (13)
      Tests  263 passed (263)
   Start at  20:48:12
   Duration  1.74s (transform 1.19s, setup 1.03s, import 3.06s, tests 2.22s, environment 3.91s)

```
