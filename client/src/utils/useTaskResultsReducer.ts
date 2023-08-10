import { useReducer } from "react";
import { MediaItemType, TaskResultsType } from "utils/types";

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
  console.log("taskResultsReducer", { state, action });
  if (action.type === "setGroupSelected") {
    const group = state.groups[action.groupId];
    return {
      ...state,
      groups: {
        ...state.groups,
        [action.groupId]: { ...group, isSelected: action.isSelected },
      },
    };
  }
  if (action.type === "setAllGroupsSelected") {
    return {
      ...state,
      groups: Object.fromEntries(
        Object.entries(state.groups).map(([groupId, group]) => [
          groupId,
          { ...group, isSelected: action.isSelected },
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
    return {
      ...state,
      mediaItems: {
        ...state.mediaItems,
        [action.mediaItemId]: { ...mediaItem, ...action.attributes },
      },
    };
  } else {
    throw new Error(`Unregognized action type: ${action.type}`);
  }
}

export function useTaskResultsReducer(initialState: TaskResultsType) {
  return useReducer(taskResultsReducer, initialState);
}
