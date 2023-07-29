import { createContext } from "react";

interface UserType {
  name: string;
}

interface AppContextType {
  user?: UserType;
  hasActiveTask: boolean;
  isLoading: boolean;
}

export const AppContext = createContext<AppContextType>({
  user: null,
  hasActiveTask: false,
  isLoading: true,
});
