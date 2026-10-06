import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";

interface User {
  id: number;
  email: string;
  username: string;
  role: "USER" | "ADMIN";
}

export const UsersPage = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isAdmin) {
      navigate("/dashboard");
      return;
    }

    const fetchUsers = async () => {
      try {
        const response = await apiFetch("/api/users");
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isAdmin, navigate]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch("/api/admin-auth/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      });

      if (response.ok) {
        setSuccess("Invitation envoyée !");
        setInviteEmail("");
        setTimeout(() => {
          setShowInviteModal(false);
          setSuccess("");
        }, 2000);
      } else {
        const data = await response.json();
        setError(data.error || "Erreur lors de l’envoi");
      }
    } catch {
      setError("Erreur lors de l’envoi");
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return <p className="py-24 text-center text-muted">Chargement...</p>;
  }

  const closeInvite = () => {
    setShowInviteModal(false);
    setError("");
    setSuccess("");
    setInviteEmail("");
  };

  return (
    <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="page-title">Utilisateurs</h1>
          <p className="text-[15px] text-ink-2">
            {users.length} membre{users.length > 1 ? "s" : ""} dans l’espace
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              // TODO: Exporter les utilisateurs
              console.log("TODO: Export users");
            }}
            className="icon-btn"
            title="Exporter les utilisateurs"
            aria-label="Exporter les utilisateurs"
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              // TODO: Importer des utilisateurs
              console.log("TODO: Import users");
            }}
            className="icon-btn"
            title="Importer des utilisateurs"
            aria-label="Importer des utilisateurs"
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <button type="button" onClick={() => setShowInviteModal(true)} className="btn-primary ml-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Inviter
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <p className="px-6 py-12 text-center text-muted">Aucun utilisateur</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/user/${user.id}`)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-paper-soft transition text-left cursor-pointer"
                >
                  <span
                    className={`w-[34px] h-[34px] flex-none rounded-full flex items-center justify-center text-xs font-bold text-ink ${
                      user.role === "ADMIN" ? "bg-neon" : "bg-indigo-soft"
                    }`}
                  >
                    {user.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-semibold text-ink truncate">{user.username}</span>
                    <span className="font-mono text-xs text-muted truncate">{user.email}</span>
                  </span>
                  <span
                    className={`pill ${
                      user.role === "ADMIN" ? "bg-ink text-neon" : "bg-chip text-ink-2"
                    }`}
                  >
                    {user.role === "ADMIN" ? "Admin" : "Utilisateur"}
                  </span>
                  <svg className="w-4 h-4 flex-none text-muted" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showInviteModal && (
        <div className="modal-backdrop">
          <div className="modal max-w-md" role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <form onSubmit={handleInvite} className="p-6 flex flex-col gap-4">
              <h3 id="invite-title" className="section-title">
                Inviter un utilisateur
              </h3>

              {error && (
                <div className="px-4 py-3 rounded-[10px] bg-danger-tint text-danger-ink text-sm">{error}</div>
              )}

              {success && (
                <div className="px-4 py-3 rounded-[10px] bg-neon-tint text-neon-ink text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {success}
                </div>
              )}

              <label className="label">
                E-mail
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                  placeholder="utilisateur@exemple.com"
                  required
                  autoFocus
                />
                <span className="text-xs font-normal text-muted">
                  Un e-mail d’invitation sera envoyé à cette adresse.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeInvite} className="btn-secondary">
                  Annuler
                </button>
                <button type="submit" disabled={sending || !!success} className="btn-primary">
                  {sending ? "Envoi..." : "Inviter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
