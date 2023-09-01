import { createContext } from "react";
import { UserInfoType } from "./types";

export interface ActiveTaskType {
  status: "SENT" | "PROGRESS" | "SUCCESS" | "FAILURE";
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
  activeTask?: ActiveTaskType;
  reloadActiveTask: () => void;
}

export const AppContext = createContext<AppContextType>({
  isLoggedIn: false,
  user: undefined,
  activeTask: undefined,
  reloadActiveTask: () => {},
});
