import { createTheme, ThemeProvider } from "@mui/material/styles"
import { render } from "@testing-library/react"
import React from "react"
import { bench, describe, vi } from "vitest"

import { DuplicateGroups } from "../../components/DuplicateGroups"
import type { DuplicateGroup } from "../../lib/types"
import { makeLargeResults } from "./fixtures"

vi.mock("../../components/useBlobUrl", () => ({
  useBlobUrl: (url: string | undefined) => ({
    blobUrl: url ? `blob:${url}` : undefined,
    loading: false
  })
}))

vi.mock("../../components/PhotoViewerModal", () => ({
  PhotoViewerModal: () => null
}))

const theme = createTheme()

function makeKeptByGroupId(groups: DuplicateGroup[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const g of groups) m.set(g.id, new Set([g.originalMediaKey]))
  return m
}

// Build fixture data once — shared across all bench iterations
const { groups, mediaItems } = makeLargeResults()
const allSelected = new Set(groups.map((g) => g.id))
const keptByGroupId = makeKeptByGroupId(groups)

// One group deselected (g-1) for the toggle-group bench
const deselectedOne = new Set(allSelected)
deselectedOne.delete("g-1")

// keptByGroupId with an extra kept key on the big group for the toggle-kept bench
const keptBigGroupToggled = new Map(keptByGroupId)
keptBigGroupToggled.set("g-0", new Set(["m-0-0", "m-0-1"]))

function renderGroups(props: React.ComponentProps<typeof DuplicateGroups>) {
  return render(
    <ThemeProvider theme={theme}>
      <DuplicateGroups {...props} />
    </ThemeProvider>
  )
}

describe("DuplicateGroups perf", () => {
  bench(
    "load: 10k groups initial render",
    () => {
      const { unmount } = renderGroups({
        groups,
        mediaItems,
        selectedGroupIds: allSelected,
        reviewedGroupIds: allSelected,
        onToggleGroup: () => {},
        onSkipGroup: () => {},
        keptByGroupId,
        onToggleKept: () => {},
        onTrashAll: () => {}
      })
      unmount()
    },
    { time: 1000 }
  )

  bench(
    "toggle-group: re-render after one group deselect",
    () => {
      const { rerender, unmount } = renderGroups({
        groups,
        mediaItems,
        selectedGroupIds: allSelected,
        reviewedGroupIds: allSelected,
        onToggleGroup: () => {},
        onSkipGroup: () => {},
        keptByGroupId,
        onToggleKept: () => {},
        onTrashAll: () => {}
      })
      rerender(
        <ThemeProvider theme={theme}>
          <DuplicateGroups
            groups={groups}
            mediaItems={mediaItems}
            selectedGroupIds={deselectedOne}
            reviewedGroupIds={allSelected}
            onToggleGroup={() => {}}
            onSkipGroup={() => {}}
            keptByGroupId={keptByGroupId}
            onToggleKept={() => {}}
            onTrashAll={() => {}}
          />
        </ThemeProvider>
      )
      unmount()
    },
    { time: 1000 }
  )

  bench(
    "toggle-kept: re-render after one kept toggle on big group",
    () => {
      const { rerender, unmount } = renderGroups({
        groups,
        mediaItems,
        selectedGroupIds: allSelected,
        reviewedGroupIds: allSelected,
        onToggleGroup: () => {},
        onSkipGroup: () => {},
        keptByGroupId,
        onToggleKept: () => {},
        onTrashAll: () => {}
      })
      rerender(
        <ThemeProvider theme={theme}>
          <DuplicateGroups
            groups={groups}
            mediaItems={mediaItems}
            selectedGroupIds={allSelected}
            reviewedGroupIds={allSelected}
            onToggleGroup={() => {}}
            onSkipGroup={() => {}}
            keptByGroupId={keptBigGroupToggled}
            onToggleKept={() => {}}
            onTrashAll={() => {}}
          />
        </ThemeProvider>
      )
      unmount()
    },
    { time: 1000 }
  )
})
