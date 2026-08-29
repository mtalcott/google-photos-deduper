# Capping oversized timestamp buckets in smart detection

*2026-08-28T22:16:06Z by Showboat 0.6.1*
<!-- showboat-id: e20fb666-0668-4b2a-bac9-7d4371e3c0f3 -->

## The problem

Smart mode buckets photos by timestamp, then compares every pair *within* each
bucket. That cost is quadratic in bucket size. With a wide time window (the 1h
setting), one dense hour — a wedding, a burst-shoot, a bulk import — drops
thousands of photos into a single bucket and the scan appears to hang.

It is not a frozen UI: detection runs in a worker, and cancel works because
`runSmartDetectionInWorker` calls `worker.terminate()` on abort. The user-visible
failure is that progress was only posted every 100 buckets, so a single huge
bucket showed no movement at all for tens of minutes.

Measured worker throughput is 6.26e8 multiply-adds/sec at dim=1024, which puts a
50,000-item bucket at ~34 minutes.

## The change

`splitOversizedBuckets` caps any bucket at `MAX_BUCKET_SIZE` (5,000), splitting
oversized ones into near-equal, time-contiguous chunks. This trades recall for a
bounded runtime — duplicates straddling a chunk boundary are missed — so the
count of split buckets is surfaced in the results UI.

`groupByTimestamp` also now drops items whose timestamp is not finite. Previously
`undefined` produced a `NaN` key, and since `Map` treats every `NaN` as the same
key, all such items collapsed into one bucket; `null` floored to 0 and silently
joined the epoch bucket.

## Diff under test

```bash
git diff --stat
```

```output
 components/DuplicateGroups.tsx             |  15 ++++
 lib/app-reducer.ts                         |  12 +++
 lib/duplicate-detector.ts                  |  76 ++++++++++++++--
 lib/types.ts                               |   4 +
 package-lock.json                          |   2 +
 tabs/app.tsx                               |  18 +++-
 tests/components/duplicate-groups.test.tsx |  32 +++++++
 tests/lib/app-reducer.test.ts              |  71 +++++++++++++++
 tests/lib/duplicate-detector.test.ts       | 136 ++++++++++++++++++++++++++++-
 workers/embedder.worker.ts                 |   7 +-
 10 files changed, 359 insertions(+), 14 deletions(-)
```

```bash
sed -n '/^export const MAX_BUCKET_SIZE/,/^}/p' lib/duplicate-detector.ts
```

```output
export const MAX_BUCKET_SIZE = 5000;

/**
 * Split buckets larger than `cap` into smaller, time-contiguous chunks so no
 * single pairwise comparison runs unbounded.
 *
 * Chunks are near-equal rather than cap-sized — splitting 5,001 items at a cap
 * of 5,000 yields 2,501 + 2,500, not 5,000 + 1. Items are sorted by timestamp
 * first so each chunk covers a contiguous slice of time, which is where real
 * duplicates cluster.
 *
 * This trades recall for a bounded runtime: duplicates that straddle a chunk
 * boundary are not detected. `bucketsSplit` counts how many source buckets
 * were affected so the UI can say so.
 */
export function splitOversizedBuckets(
  buckets: GpdMediaItem[][],
  cap = MAX_BUCKET_SIZE,
): { buckets: GpdMediaItem[][]; bucketsSplit: number } {
  const out: GpdMediaItem[][] = [];
  let bucketsSplit = 0;

  for (const bucket of buckets) {
    if (bucket.length <= cap) {
      out.push(bucket);
      continue;
    }
    bucketsSplit++;

    const sorted = [...bucket].sort((a, b) => a.timestamp - b.timestamp);
    const chunkCount = Math.ceil(sorted.length / cap);
    const chunkSize = Math.ceil(sorted.length / chunkCount);
    for (let i = 0; i < sorted.length; i += chunkSize)
      out.push(sorted.slice(i, i + chunkSize));
  }

  return { buckets: out, bucketsSplit };
}
```

## Typecheck and full suite

248 tests, up from 225 on the base commit — 23 new covering the split function,
the non-finite timestamp guard, reducer plumbing, and the UI notice.

```bash
npx tsc --noEmit -p tsconfig.json && echo 'typecheck: clean' && npm test 2>&1 | tail -6
```

```output
typecheck: clean

 Test Files  13 passed (13)
      Tests  248 passed (248)
   Start at  15:17:04
   Duration  1.36s (transform 734ms, setup 576ms, import 1.92s, tests 2.12s, environment 2.70s)

```

## Exercised against a synthetic 121k-item library

Unit tests prove the contract; this runs the real `groupByTimestamp` and
`splitOversizedBuckets` (bundled with esbuild) over a library shaped like a real
one: 40,000 sparse photos plus three dense bursts of 8k / 20k / 50k that each
land inside a single 1-hour bucket, plus 3,000 items with no timestamp.

Times are derived from the measured worker rate of 6.26e8 multiply-adds/sec at
dim=1024, not wall-clock — running the actual comparisons would take the 40
minutes the fix exists to avoid. The harness is throwaway and lives outside the
repo, so this block will not reproduce on a later `showboat verify`.

```bash
node /private/tmp/claude-501/-Users-yakovv-marina-work-deduper/41396d94-0894-44a5-90dd-b4886ea0e177/scratchpad/exercise/out.cjs
```

```output
library: 121000 items (3,000 with undefined timestamps)

BEFORE cap:
  buckets: 3334, largest three: 50012, 20012, 8012
  worst single bucket: 34.1 min
  total pairwise time: 40.4 min

AFTER cap (MAX_BUCKET_SIZE=5000):
  buckets: 3349, largest three: 4547, 4547, 4547
  bucketsSplit reported: 3
  worst single bucket: 16.9 s
  total pairwise time: 4.63 min

items preserved:       118000 -> 118000  OK
max bucket <= cap:     OK
bad timestamps dropped: OK
```

## Result

| | before | after |
|---|---|---|
| worst single bucket | 34.1 min | 16.9 s |
| total pairwise time | 40.4 min | 4.63 min |
| buckets split | — | 3 (surfaced in UI) |

No items lost, no bucket above the cap, and the 3,000 timestamp-less items are
excluded from bucketing instead of collapsing into one 3,000-item bucket.

## Known limitation

Duplicates that straddle a chunk boundary are not detected. That is the trade
this change makes deliberately, and the results page now says so whenever
`bucketsSplit > 0`. The full-mode `topK` problem (a separate O(n^2 log n) bug in
`workerCommunityDetection`) is untouched here.
