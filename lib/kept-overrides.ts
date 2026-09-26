// Per-group "kept" overrides.
//
// Every group normally keeps at least one item — selectDefaultKeep picks it,
// and the per-photo toggle refuses to remove the last one. Trashing a whole
// group is the deliberate exception, represented by an override holding an
// empty set. That distinction matters: an absent override means "use the
// default keep", while an empty one means "keep nothing".

import type { DuplicateGroup } from "./types";

export type KeptOverrides = Record<string, Set<string>>;

/**
 * True when this group is set to keep nothing, i.e. every item in it will be
 * trashed. An undefined set means no override, which always keeps one item.
 */
export function isWholeGroupTrashed(keptSet: Set<string> | undefined): boolean {
  return keptSet !== undefined && keptSet.size === 0;
}

/**
 * Toggle a group between "trash everything" and the default keep.
 *
 * Toggling back removes the override rather than restoring a remembered
 * selection, so the current default — which prefers favorites — applies again
 * instead of freezing a stale choice.
 */
export function toggleWholeGroupTrashed(
  overrides: KeptOverrides,
  groupId: string,
): KeptOverrides {
  if (isWholeGroupTrashed(overrides[groupId])) {
    const next = { ...overrides };
    delete next[groupId];
    return next;
  }
  return { ...overrides, [groupId]: new Set<string>() };
}

/**
 * How many of the groups selected for trashing would be removed entirely.
 * Used to warn in the confirmation dialog, where "move N duplicates to trash"
 * reads very differently if some groups leave no survivor.
 */
export function countFullyTrashedGroups(
  groups: DuplicateGroup[],
  selectedGroupIds: Set<string>,
  keptFor: (group: DuplicateGroup) => Set<string>,
): number {
  let count = 0;
  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue;
    if (keptFor(group).size === 0) count++;
  }
  return count;
}
