import { useReducer } from "react";
import {
  MediaItemType,
  TaskResultsGroupType,
  TaskResultsType,
} from "utils/types";

export type TaskResultsActionType =
  | {
      type: "setGroupSelected";
      groupId: string;
      isSelected: boolean;
    }
  | {
      type: "setAllGroupsSelected";
      isSelected: boolean;
    }
  | {
      type: "setOriginalMediaItemId";
      groupId: string;
      mediaItemId: string;
    }
  | {
      type: "setMediaItem";
      mediaItemId: string;
      attributes: Partial<MediaItemType>;
    }
  | {
      type: "updateMediaItem";
      mediaItemId: string;
      attributes: Partial<MediaItemType>;
    };

function taskResultsReducer(
  state: TaskResultsType,
  action: TaskResultsActionType
) {
  if (action.type === "setGroupSelected") {
    const group = state.groups[action.groupId];
    return {
      ...state,
      groups: {
        ...state.groups,
        [action.groupId]: {
          ...group,
          isSelected: group.hasDuplicates && action.isSelected,
        },
      },
    };
  }
  if (action.type === "setAllGroupsSelected") {
    return {
      ...state,
      groups: Object.fromEntries(
        Object.entries(state.groups).map(([groupId, group]) => [
          groupId,
          { ...group, isSelected: group.hasDuplicates && action.isSelected },
        ])
      ),
    };
  } else if (action.type === "setOriginalMediaItemId") {
    const group = state.groups[action.groupId];
    return {
      ...state,
      groups: {
        ...state.groups,
        [action.groupId]: { ...group, originalMediaItemId: action.mediaItemId },
      },
    };
  } else if (action.type === "setMediaItem") {
    const mediaItem = state.mediaItems[action.mediaItemId];
    const newState = {
      ...state,
      mediaItems: {
        ...state.mediaItems,
        [action.mediaItemId]: { ...mediaItem, ...action.attributes },
      },
    };
    // Also update hasDuplicates on groups. Only need the group that contains
    //   this mediaItem, but we have no reverse lookup from mediaItem to
    //   group, so update all groups.
    newState.groups = Object.fromEntries(
      Object.entries(state.groups).map(([groupId, group]) => {
        const hasDuplicates = groupHasDuplicates(group, newState);
        return [
          groupId,
          {
            ...group,
            hasDuplicates: hasDuplicates,
            isSelected: group.isSelected && hasDuplicates,
          },
        ];
      })
    );
    return newState;
  } else {
    throw new Error(`Unregognized action type: ${action.type}`);
  }
}

function groupHasDuplicates(
  group: TaskResultsGroupType,
  results: TaskResultsType
): boolean {
  return (
    group.mediaItemIds.filter(
      (mediaItemId) =>
        // Filter out the original
        group.originalMediaItemId !== mediaItemId &&
        // Filter out mediaItems that have already been deleted
        !results.mediaItems[mediaItemId].deletedAt
    ).length > 0
  );
}

export function useTaskResultsReducer(initialState: TaskResultsType) {
  // Set initial hasDuplicates on groups
  const state: TaskResultsType = {
    ...initialState,
    groups: Object.fromEntries(
      Object.entries(initialState.groups).map(([groupId, group]) => [
        groupId,
        { ...group, hasDuplicates: groupHasDuplicates(group, initialState) },
      ])
    ),
  };
  return useReducer(taskResultsReducer, state);
}
