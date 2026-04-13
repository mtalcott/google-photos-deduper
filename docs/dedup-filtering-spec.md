# Deduplication Filtering & Results — Feature Spec

> **Context:** The tool compares photos via perceptual image embeddings (MediaPipe MobileNet V3, cosine similarity). It is fast and quota-safe. Both taken date and upload date are available from the API. This spec evaluates user-requested features from [#7](https://github.com/mtalcott/google-photos-deduper/issues/7), [#19](https://github.com/mtalcott/google-photos-deduper/issues/19), and [discussion #41](https://github.com/mtalcott/google-photos-deduper/discussions/41) in this context and identifies new improvements.

---

## What the Old Issues Asked For — and Where Things Stand

| Request | Origin | Status |
|---|---|---|
| API quota / 429 throttling | #41 | **Resolved** — no per-photo API calls during scanning |
| False positives from filename/filesize matching | #41 | **Resolved** — visual embeddings are the only signal |
| Similarity threshold control | #41, #7 | **Already implemented** — slider (0.90–1.00, default 0.99) |
| Filter results by similarity, filename, resolution | #7, #41 | **Not implemented** |
| Date range scan filter | #19 | **Partially implemented** — types + code path exist, no UI |
| Sort results by similarity or group size | #7 (owner comment) | **Not implemented** |
| Smarter "keep" selection | implicit | **Not implemented** — currently defaults to oldest upload |

---

## Feature Proposals

Ordered by priority.

---

### 1. Smarter Default "Keep" Selection

**Priority: High**

Currently, the first-uploaded photo in a group is pre-selected as the one to keep. This is a poor heuristic — a low-quality Storage Saver copy uploaded years ago will be kept over a higher-resolution original uploaded later.

**Requirements:**

The default "keep" selection within each duplicate group should follow this priority order, applied in sequence:

1. **Original quality over Storage Saver** — if any item in the group is original quality and others are Storage Saver, always pre-select the original-quality item(s).
2. **Higher resolution** — among items of equal quality tier, pre-select the one with the greatest pixel count (width × height).
3. **Oldest upload date** — as a tiebreaker when quality and resolution are identical, prefer the earliest-uploaded item (current behavior).

When multiple items tie across all three criteria, keep the current behavior (first in sorted order).

**Behavior:**
- This auto-selection is a default starting point only. Users retain full ability to override by clicking any photo in the group.
- The constraint that at least one photo per group must be marked Keep is unchanged.
- The selection logic runs after scan completes; no re-scan is required when viewing existing results.

---

### 2. Sort Results

**Priority: High**

Users with large libraries can generate hundreds or thousands of duplicate groups. The current fixed ordering (largest group first) gives no control over where to start.

**Requirements:**

- **Sort by group size** (number of photos) — largest first (current default), or smallest first.
- **Sort by similarity** — highest average similarity first, or lowest first. This lets users start with the most confident duplicates.
- **Sort by date** — group's oldest photo taken date, ascending or descending. Useful for working through a library chronologically.
- Sort controls are in the results view and apply instantly without re-scanning.
- The selected sort order should persist in settings.

---

### 3. Date Range Scan Filter (UI)

**Priority: High**

The code infrastructure for date range filtering already exists (`ScanSettings.dateRange`, passed to `getAllMediaItems`). It just needs a UI.

**Requirements:**

- Two optional date fields in the scan configuration: **From** and **To**.
- Both fields accept a calendar date. Either can be left blank to mean "no bound."
- Filtering applies to **both taken date and upload date**: a photo is included if either its taken date or its upload date falls within the range. *(See note below.)*
- Alternatively, expose separate "filter by taken date" vs. "filter by upload date" options if the API supports distinct filtering; otherwise apply to whichever date field GPTK passes through.
- The date range persists in settings between sessions.
- A clear "scanning X of Y photos in library" indicator should reflect the filtered count.

**Use case:** A user who knows duplicates were imported during a specific period (e.g., a bulk import in 2019) can scan only that window rather than the full 100K-photo library.

---

### 4. Filter Results by Similarity Score

**Priority: Medium**

After scanning, users want to work in passes — first clearing obvious duplicates (very high similarity), then reviewing borderline ones.

**Requirements:**

- A minimum similarity filter in the results view (e.g., a slider or numeric input).
- Groups whose average similarity falls below the filter threshold are hidden from the list.
- The filter operates on already-computed results; no re-scan is needed.
- Lowering the filter below the original scan threshold has no effect (can't recover groups that were never detected).
- The current scan threshold should be shown as context (e.g., "Scan threshold: 99% — showing groups above 95%").

---

### 5. Re-Evaluate Threshold Without Re-Scanning

**Priority: Medium**

Currently, changing the similarity threshold requires a full re-scan. But embeddings are already computed — regrouping them with a different threshold is fast.

**Requirements:**

- After a scan completes, the user can raise or lower the similarity threshold and click a "Re-group" or "Apply" action.
- Re-grouping reuses the cached embeddings; it does not re-fetch media items or re-compute embeddings.
- Lowering the threshold may produce more (or larger) groups. Raising it will produce fewer.
- This is distinct from the full "Re-scan" action, which re-fetches media and recomputes everything.

**Constraint:** This requires cached embeddings to be stored (not just the final groups). Verify storage budget before implementing — embedding vectors for large libraries may be sizable.

---

### 6. Filename Match as a Results Filter

**Priority: Low**

When a user suspects duplicates are re-uploads of the same file, they may want to see only groups where the filenames also match — as extra confirmation before trashing.

**Requirements:**

- A toggle in the results view: "Only show groups with matching filenames."
- When enabled, groups are hidden if the filenames differ across the items in that group.
- This is a post-scan filter on existing results, not a scan strategy. It does not find additional duplicates; it narrows existing ones.
- Filename data requires the extended media info fetch (already part of the scan pipeline).

**Why not a scan strategy:** Filename-only matching was a source of false positives in the old tool (different photos coincidentally sharing a filename). Visual similarity is the correct primary signal; filename is only useful as a confirmation filter.

---

## Out of Scope

| Request | Disposition |
|---|---|
| Matching by file size | File size is not displayed and not reliably available (Storage Saver items have unreliable sizes). Visual similarity supersedes it as a signal. |
| Matching by filename alone (scan strategy) | Causes false positives. Addressed as a post-scan filter (feature 6). |
| Hard cap on number of results ("show first N") | Sort + similarity filter (features 2 & 4) give users principled control without a blunt cap. |
| Camera/EXIF metadata in results | Not available from the API in the current data pipeline. |
| File size display per photo | Not reliably available; Storage Saver copies may show 0 or nothing. Low value given resolution is already shown. |
