#!/usr/bin/env node
// Appends this run's benchmark means to the rolling history that
// tools/check-bench.mjs compares against, keeping only the most recent
// MAX_HISTORY runs. Only invoked on main-branch pushes, after a successful
// benchmark + regression check.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname } from "path"

import { extractMeans } from "./bench-lib.mjs"

const MAX_HISTORY = 5
const HISTORY_PATH = "tests/perf/bench-history.json"

const means = extractMeans("bench-output.json")

let history = []
if (existsSync(HISTORY_PATH)) {
  history = JSON.parse(readFileSync(HISTORY_PATH, "utf8"))
}

history.push({
  sha: process.env.GITHUB_SHA ?? "unknown",
  timestamp: new Date().toISOString(),
  means,
})
history = history.slice(-MAX_HISTORY)

mkdirSync(dirname(HISTORY_PATH), { recursive: true })
writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
console.log(
  `Appended run to ${HISTORY_PATH} (${history.length}/${MAX_HISTORY} samples retained)`
)
