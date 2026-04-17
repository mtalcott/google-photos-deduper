#!/usr/bin/env node
// Compares bench-output.json (current run) against tests/perf/bench-baseline.json
// (most recent main-branch run, restored from CI cache).
// Exits 1 if any benchmark's mean regresses by more than THRESHOLD.

import { readFileSync, existsSync } from "fs"

const THRESHOLD = 1.10 // 10% regression limit

function extractMeans(jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, "utf8"))
  const means = {}
  for (const file of data.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        means[bench.name] = bench.mean
      }
    }
  }
  return means
}

if (!existsSync("bench-output.json")) {
  console.error("bench-output.json not found — run vitest bench first")
  process.exit(1)
}
if (!existsSync("tests/perf/bench-baseline.json")) {
  console.log("No baseline found — skipping regression check")
  process.exit(0)
}

const current = extractMeans("bench-output.json")
const baseline = extractMeans("tests/perf/bench-baseline.json")

let failed = false

for (const [name, baselineMean] of Object.entries(baseline)) {
  const currentMean = current[name]
  if (currentMean === undefined) {
    console.warn(`⚠  Missing in current run: "${name}"`)
    continue
  }
  const ratio = currentMean / baselineMean
  const pct = ((ratio - 1) * 100).toFixed(1)
  const sign = ratio >= 1 ? "+" : ""
  if (ratio > THRESHOLD) {
    console.error(
      `✗  REGRESSION "${name}": ${currentMean.toFixed(0)}ms vs baseline ${baselineMean.toFixed(0)}ms (${sign}${pct}%, limit +${((THRESHOLD - 1) * 100).toFixed(0)}%)`
    )
    failed = true
  } else {
    console.log(
      `✓  "${name}": ${currentMean.toFixed(0)}ms vs baseline ${baselineMean.toFixed(0)}ms (${sign}${pct}%)`
    )
  }
}

if (failed) process.exit(1)
