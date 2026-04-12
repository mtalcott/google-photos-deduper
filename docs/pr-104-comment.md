Thanks for the contributions! The bulk IndexedDB reads and web worker offloading are great improvements.

Two algorithmic issues needed fixing before merge, plus one small build thing:

---

**1. Community detection: O(n) walk misses non-consecutive duplicates**

The new algorithm sorts by timestamp then only compares adjacent pairs. This means two duplicate photos with any non-duplicate taken between them are never compared and the group is missed:

- Photo A (t=1, burst shot) — duplicate of C
- Photo B (t=2, different scene)
- Photo C (t=3, burst shot) — **never compared to A**

Burst shots can interleave with photos from other cameras, and re-uploads may land at very different timestamps. The original O(n²) approach (check every pair) is slower but correct — reverted to that.

---

**2. Duplicate community detection implementations**

The PR kept `communityDetection` in `lib/duplicate-detector.ts` for tests while running a separately-maintained copy inside the worker. The two had already drifted (`topK` used a simple `Array.sort` in the worker vs. a min-heap in lib). Fixed by extracting into a new shared `lib/community-detection.ts` module imported by both the worker and tests.

---

**3. Worker build missing from dev script** (minor)

Added the worker build step to `dev`, not just the prod build.

---

Rebased off main and pushed fixes directly to this branch — now merged!
