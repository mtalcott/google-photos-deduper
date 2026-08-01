// Shared helpers for tools/check-bench.mjs and tools/update-bench-history.mjs.

import { readFileSync } from "fs"

export function extractMeans(jsonPath) {
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
