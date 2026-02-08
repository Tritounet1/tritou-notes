import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";

interface User {
  id: number;
  email: string;
  username: string;
  role: "USER" | "ADMIN";
}

interface UserPermissions {
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

const PERMISSIONS_CONFIG = [
  {
    key: "accessScrapersPage",
    label: "Accéder à la page Scrapers",
    category: "Scrapers",
  },
  {
    key: "accessInstancesScrapersPage",
    label: "Accéder à la page Instances",
    category: "Scrapers",
  },
  { key: "useScraper", label: "Utiliser les scrapers", category: "Scrapers" },
  {
    key: "modifyScraper",
    label: "Modifier les scrapers",
    category: "Scrapers",
  },
  {
    key: "modifyScraperStatus",
    label: "Modifier le statut des scrapers",
    category: "Scrapers",
  },
  {
    key: "deleteScraper",
    label: "Supprimer les scrapers",
    category: "Scrapers",
  },
  {
    key: "createDocument",
    label: "Créer des documents",
    category: "Documents",
  },
  {
    key: "modifyDocument",
    label: "Modifier les documents",
    category: "Documents",
  },
  {
    key: "deleteDocument",
    label: "Supprimer les documents",
    category: "Documents",
  },
  { key: "useAiChatBot", label: "Utiliser le chatbot IA", category: "IA" },
] as const;

export const UserPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/dashboard");
      return;
    }

    const fetchData = async () => {
      try {
        const [userRes, permissionsRes] = await Promise.all([
          apiFetch(`/api/users/${id}`),
          apiFetch(`/api/user-permissions/${id}`),
        ]);

        if (userRes.ok) {
          setUser(await userRes.json());
        }
        if (permissionsRes.ok) {
          setPermissions(await permissionsRes.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isAdmin, navigate]);

  const handlePermissionChange = async (key: string, value: boolean) => {
    if (!permissions) return;

    const updatedPermissions = { ...permissions, [key]: value };
    setPermissions(updatedPermissions);

    setSaving(true);
    try {
      const response = await apiFetch(`/api/user-permissions/${id}`, {
        method: "PUT",
        body: JSON.stringify(updatedPermissions),
      });

      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (err) {
      console.error(err);
      // Revert on error
      setPermissions(permissions);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Utilisateur non trouvé</p>
      </div>
    );
  }

  // Grouper les permissions par catégorie
  const permissionsByCategory = PERMISSIONS_CONFIG.reduce(
    (acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    },
    {} as Record<string, typeof PERMISSIONS_CONFIG[number][]>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/users")}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour
          </button>
          {saving && (
            <span className="text-xs text-gray-400">Sauvegarde...</span>
          )}
        </div>

        {/* User info */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-2xl text-gray-600 font-medium">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {user.username}
              </h1>
              <p className="text-gray-500">{user.email}</p>
              <span
                className={`inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full ${
                  user.role === "ADMIN"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {user.role === "ADMIN" ? "Admin" : "Utilisateur"}
              </span>
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Permissions</h2>
            <p className="text-sm text-gray-500">
              Gérez les accès de cet utilisateur
            </p>
          </div>

          {!permissions ? (
            <div className="px-6 py-12 text-center text-gray-500">
              Aucune permission configurée
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {Object.entries(permissionsByCategory).map(
                ([category, perms]) => (
                  <div key={category} className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                      {category}
                    </h3>
                    <div className="space-y-3">
                      {perms.map((perm) => (
                        <div
                          key={perm.key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm text-gray-600">
                            {perm.label}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handlePermissionChange(
                                perm.key,
                                !permissions[perm.key as keyof UserPermissions]
                              )
                            }
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                              permissions[perm.key as keyof UserPermissions]
                                ? "bg-green-500"
                                : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                permissions[perm.key as keyof UserPermissions]
                                  ? "left-6"
                                  : "left-1"
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
