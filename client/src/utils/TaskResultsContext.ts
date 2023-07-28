import { createContext } from "react";

// interface TaskResultsContextType {
//     isLoading: boolean;
// }

// export const TaskResultsContext = createContext<TaskResultsContextType>({
export const TaskResultsContext = createContext({
    results: null,
});
