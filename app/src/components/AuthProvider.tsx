import { useEffect, useState, useCallback, type ReactNode } from "react";
import { apiFetch } from "../api";
import { AuthContext, type PermissionKey, type User } from "../context/AuthContext";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Chargement…</p>
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
