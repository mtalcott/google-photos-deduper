import { createContext } from "react";
import { UserInfoType } from "./types";

export interface ActiveTaskType {
  status: "PENDING" | "PROGRESS" | "SUCCESS" | "FAILURE";
  meta?: {
    logMessage?: string;
    steps?: {
      [step: string]: {
        startedAt: string;
        completedAt?: string;
        count?: number;
      };
    };
  };
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
