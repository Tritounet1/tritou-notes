import { createContext } from "react";

export interface UserPermissions {
  id: number;
  modifyScraper: boolean;
  useScraper: boolean;
  modifyScraperStatus: boolean;
  deleteScraper: boolean;
  createDocument: boolean;
  deleteDocument: boolean;
  modifyDocument: boolean;
  useAiChatBot: boolean;
  accessScrapersPage: boolean;
  accessInstancesScrapersPage: boolean;
  userId: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role?: "USER" | "ADMIN";
  userPermissions?: UserPermissions | null;
}

export interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
