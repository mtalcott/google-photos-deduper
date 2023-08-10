import { createContext } from "react";
import { TaskResultsType } from "utils/types";
import { TaskResultsActionType } from "utils/useTaskResultsReducer";

interface TaskResultsContextType {
  results: TaskResultsType;
  dispatch: (action: TaskResultsActionType) => void;
  selectedMediaItemIds: Set<string>;
}

export const TaskResultsContext = createContext<TaskResultsContextType>({
  results: { groups: {}, mediaItems: {}, similarityMap: {} },
  dispatch: () => {},
  selectedMediaItemIds: new Set(),
});
