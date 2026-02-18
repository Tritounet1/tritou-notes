import { useEffect, useState, useCallback, type ReactNode } from "react";
import { apiFetch } from "../api";
import { AuthContext, type PermissionKey, type User } from "../context/AuthContext";

function getInitialUser(): User | null {
  if (typeof window === "undefined") return null;
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;
  return JSON.parse(storedUser);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(getInitialUser);
  const [loading, setLoading] = useState(true);

  // Verifier l'authentification au chargement
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiFetch("/auth/me");
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = (newUser: User) => {
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignorer les erreurs
    }
    setUser(null);
  };

  const isAdmin = user?.role === "ADMIN";

  const hasPermission = useCallback(
    (...permissions: PermissionKey[]) => {
      if (isAdmin) return true;
      if (!user?.userPermissions) return false;
      return permissions.every((perm) => user.userPermissions![perm]);
    },
    [user, isAdmin],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user, isAdmin, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
};
