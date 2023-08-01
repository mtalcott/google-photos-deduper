import { createContext } from "react";
import { UserInfoType } from "utils";

interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "FAILURE" | "SUCCESS";
  // TODO: progress
}

interface AppContextType {
  isLoggedIn: boolean;
  user?: UserInfoType;
  activeTask?: ActiveTaskType;
  reloadActiveTask: () => void;
}

export const AppContext = createContext<AppContextType>({
  isLoggedIn: false,
  user: undefined,
  activeTask: undefined,
  reloadActiveTask: () => {},
});
