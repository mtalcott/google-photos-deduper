import { createContext } from "react";

interface UserType {
  name: string;
}

interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "FAILURE" | "SUCCESS";
  // TODO: progress
}

interface AppContextType {
  isLoggedIn: boolean;
  user?: UserType;
  activeTask?: ActiveTaskType;
  reloadActiveTask: () => void;
}

export const AppContext = createContext<AppContextType>({
  isLoggedIn: false,
  user: undefined,
  activeTask: undefined,
  reloadActiveTask: () => {},
});
