import { createContext } from "react";
import { UserInfoType } from "utils";

interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "FAILURE" | "SUCCESS";
  // TODO: progress
}

export interface AppContextType {
  isLoggedIn: boolean;
  user?: UserInfoType;
  hasActiveTask: boolean;
  activeTask?: ActiveTaskType;
  reloadActiveTask: () => void;
}

export const AppContext = createContext<AppContextType>({
  isLoggedIn: false,
  user: undefined,
  activeTask: undefined,
  hasActiveTask: false,
  reloadActiveTask: () => {},
});
