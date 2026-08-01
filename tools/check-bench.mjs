#!/usr/bin/env node
// Compares bench-output.json (current run) against a rolling history of
// recent main-branch runs (tests/perf/bench-history.json).
//
// GitHub Actions' shared runners show large VM-to-VM wall-clock variance for
// these jsdom render benchmarks — swings of 20-30%+ between otherwise
// unchanged commits, even though noise *within* a single run is much lower
// (~5-6% RME). That points to per-VM-instance bias (noisy neighbors, CPU
// steal) as the dominant noise source, not benchmark jitter. Comparing
// against a single most-recent run chases that per-VM bias directly; the
// median of several recent runs averages it out instead.
//
// Exits 1 if any benchmark's mean regresses by more than THRESHOLD against
// its rolling median baseline.

import { existsSync, readFileSync } from "fs"

import { extractMeans } from "./bench-lib.mjs"

const THRESHOLD = 1.2 // 20% regression limit against the rolling median
const MIN_HISTORY_SAMPLES = 3 // fewer samples than this isn't enough to trust a median
const HISTORY_PATH = "tests/perf/bench-history.json"

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

if (!existsSync("bench-output.json")) {
  console.error("bench-output.json not found — run vitest bench first")
  process.exit(1)
}

const current = extractMeans("bench-output.json")

if (!existsSync(HISTORY_PATH)) {
  console.log("No benchmark history found — skipping regression check")
  process.exit(0)
}

const history = JSON.parse(readFileSync(HISTORY_PATH, "utf8"))

let failed = false

for (const [name, currentMean] of Object.entries(current)) {
  const historicalMeans = history
    .map((run) => run.means[name])
    .filter((mean) => typeof mean === "number")

  if (historicalMeans.length < MIN_HISTORY_SAMPLES) {
    console.log(
      `…  "${name}": only ${historicalMeans.length} historical sample(s) — skipping (need ${MIN_HISTORY_SAMPLES})`
    )
    continue
  }

  const baselineMean = median(historicalMeans)
  const ratio = currentMean / baselineMean
  const pct = ((ratio - 1) * 100).toFixed(1)
  const sign = ratio >= 1 ? "+" : ""

  if (ratio > THRESHOLD) {
    console.error(
      `✗  REGRESSION "${name}": ${currentMean.toFixed(0)}ms vs rolling median ${baselineMean.toFixed(0)}ms over ${historicalMeans.length} runs (${sign}${pct}%, limit +${((THRESHOLD - 1) * 100).toFixed(0)}%)`
    )
    failed = true
  } else {
    console.log(
      `✓  "${name}": ${currentMean.toFixed(0)}ms vs rolling median ${baselineMean.toFixed(0)}ms over ${historicalMeans.length} runs (${sign}${pct}%)`
    )
  }
}

if (failed) process.exit(1)
