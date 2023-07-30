import { createContext } from "react";

interface UserType {
  name: string;
}

interface AppContextType {
  user?: UserType;
  hasActiveTask: boolean;
  isLoggedIn: boolean;
}

export const AppContext = createContext<AppContextType>({
  user: undefined,
  hasActiveTask: false,
  isLoggedIn: true,
});
