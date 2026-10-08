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
    return <p className="py-24 text-center text-muted">Chargement...</p>;
  }

  if (!user) {
    return <p className="py-24 text-center text-danger-ink">Utilisateur non trouvé</p>;
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
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/users")}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
          Utilisateurs
        </button>
        {saving && <span className="text-xs text-muted">Sauvegarde...</span>}
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <span
          className={`w-16 h-16 flex-none rounded-full flex items-center justify-center font-display font-extrabold text-[22px] text-ink ${
            user.role === "ADMIN" ? "bg-neon" : "bg-indigo-soft"
          }`}
        >
          {user.username.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex flex-col gap-2 min-w-0">
          <h1 className="page-title break-words">{user.username}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-muted">{user.email}</span>
            <span className={`pill ${user.role === "ADMIN" ? "bg-ink text-neon" : "bg-chip text-ink-2"}`}>
              {user.role === "ADMIN" ? "Admin" : "Utilisateur"}
            </span>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="section-title">Permissions</h2>
          <p className="text-[15px] text-ink-2">Gérez les accès de cet utilisateur.</p>
        </div>

        {!permissions ? (
          <p className="card px-6 py-12 text-center text-muted">Aucune permission configurée</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {["Documents", "Scrapers", "IA"].map((category) => (
              <div key={category} className="card p-4 flex flex-col gap-1">
                <h3 className="eyebrow pb-2">{category}</h3>
                {(permissionsByCategory[category] ?? []).map((perm) => {
                  const on = !!permissions[perm.key as keyof UserPermissions];
                  return (
                    <label
                      key={perm.key}
                      className="flex items-center justify-between gap-3 py-2 text-sm text-ink-2 cursor-pointer"
                    >
                      {perm.label}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => handlePermissionChange(perm.key, !on)}
                        className={`relative flex-none w-10 h-[22px] rounded-full transition-colors cursor-pointer ${
                          on ? "bg-indigo" : "bg-stone-soft"
                        }`}
                      >
                        <span
                          className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-[left] ${
                            on ? "left-[21px]" : "left-[3px]"
                          }`}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
