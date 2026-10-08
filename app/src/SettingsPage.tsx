import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";
import { useConfirm } from "./hooks/useConfirm";
import { AiSettings } from "./components/AiSettings";
import { McpSettings } from "./components/McpSettings";

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    {open ? (
      <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    ) : (
      <>
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </>
    )}
  </svg>
);

const SecretInput = ({
  value,
  onChange,
  shown,
  onToggle,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  shown: boolean;
  onToggle: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) => (
  <span className="relative block">
    <input
      {...rest}
      type={shown ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input pr-11 ${rest.className ?? ""}`}
    />
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Masquer" : "Afficher"}
      className="absolute right-1 top-1/2 -translate-y-1/2 icon-btn w-8 h-8"
    >
      <EyeIcon open={shown} />
    </button>
  </span>
);

interface Settings {
  id: number;
  openrouterApiKeySet: boolean;
  aiTextModel: string | null;
  aiImageModel: string | null;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
}

export const SettingsPage = () => {
  const { isAdmin, user, logout } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState<"account" | "ai" | "mail" | "mcp">("account");
  const [ai, setAi] = useState({ keySet: false, textModel: null as string | null, imageModel: null as string | null });
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);


  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // SMTP
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  // The stored password never comes back from the API: type one only to replace it.
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [showSmtpHost, setShowSmtpHost] = useState(false);
  const [showSmtpUser, setShowSmtpUser] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  // Feedback
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    const fetchSettings = async () => {
      try {
        const response = await apiFetch("/api/settings", { signal: controller.signal });
        if (response.ok && !controller.signal.aborted) {
          const data: Settings[] = await response.json();
          if (data.length > 0) {
            const s = data[0];
            setSettingsId(s.id);
            setAi({ keySet: s.openrouterApiKeySet, textModel: s.aiTextModel, imageModel: s.aiImageModel });
            setSmtpHost(s.smtpHost || "");
            setSmtpPort(s.smtpPort?.toString() || "587");
            setSmtpUser(s.smtpUser || "");
            setSmtpPasswordSet(s.smtpPasswordSet);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchSettings();
    return () => controller.abort();
  }, [isAdmin]);

  const showFeedback = (type: "success" | "error", message: string) => {
    if (type === "success") {
      setSuccess(message);
      setError("");
    } else {
      setError(message);
      setSuccess("");
    }
    setTimeout(() => {
      setSuccess("");
      setError("");
    }, 3000);
  };

  /** Saves settings fields; resolves to whether the save succeeded. */
  const saveSettings = async (data: Record<string, unknown>) => {
    if (!isAdmin || !settingsId || saving) return false;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/settings/${settingsId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      showFeedback(response.ok ? "success" : "error", response.ok ? "Paramètres enregistrés" : "Erreur lors de la sauvegarde");
      return response.ok;
    } catch {
      showFeedback("error", "Erreur lors de la sauvegarde");
      return false;
    } finally {
      setSaving(false);
    }
  };


  /** Signs out every device, this one included (the session token version changes). */
  const handleLogoutEverywhere = async () => {
    const ok = await confirm({
      title: "Déconnecter toutes les sessions ?",
      message: "Tous les appareils connectés à votre compte, celui-ci compris, devront se reconnecter.",
      confirmLabel: "Tout déconnecter",
    });
    if (!ok) return;
    try {
      const response = await apiFetch("/auth/logout-everywhere", { method: "POST" });
      if (!response.ok) throw new Error();
      logout();
    } catch {
      showFeedback("error", "Impossible de déconnecter les sessions");
    }
  };

  const handleChangePassword = async () => {
    if (saving) return;
    if (!currentPassword || newPassword.length < 8) {
      showFeedback("error", "Saisissez votre mot de passe actuel et un nouveau mot de passe d’au moins 8 caractères.");
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      showFeedback("error", "Le nouveau mot de passe est trop long (72 octets maximum).");
      return;
    }
    if (newPassword !== confirmPassword) {
      showFeedback("error", "Les mots de passe ne correspondent pas");
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (response.ok) {
        showFeedback("success", "Mot de passe mis à jour");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await response.json();
        showFeedback("error", data.message || "Erreur lors du changement de mot de passe");
      }
    } catch {
      showFeedback("error", "Erreur lors du changement de mot de passe");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmtp = async () => {
    const saved = await saveSettings({
      smtpHost,
      smtpPort: smtpPort ? parseInt(smtpPort) : null,
      smtpUser,
      ...(smtpPassword && { smtpPassword }),
    });
    if (saved && smtpPassword) {
      setSmtpPasswordSet(true);
      setSmtpPassword("");
    }
  };

  if (isAdmin && loading) {
    return <p className="py-24 text-center text-muted">Chargement...</p>;
  }

  const tabs = [
    ["account", "Mon compte"],
    ...(isAdmin
      ? [
          ["ai", "Intelligence artificielle"],
          ["mail", "E-mail (SMTP)"],
        ]
      : []),
    // Personal tokens: every user can connect Claude with their own permissions.
    ["mcp", "MCP"],
  ] as ["account" | "ai" | "mail" | "mcp", string][];

  const initials = (user?.username ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-[1000px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
      {confirmDialog}
      <h1 className="page-title">Paramètres</h1>

      {(success || error) && (
        <div
          role="status"
          className={`px-4 py-3 rounded-[10px] text-sm ${
            success ? "bg-neon-tint text-neon-ink" : "bg-danger-tint text-danger-ink"
          }`}
        >
          {success || error}
        </div>
      )}

      <div className="flex flex-wrap gap-8 items-start">
        <div role="tablist" aria-label="Sections" className="flex-[1_1_180px] flex flex-col gap-0.5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`text-left rounded-[9px] px-3 min-h-[38px] text-sm transition cursor-pointer ${
                tab === key ? "bg-chip text-ink font-semibold" : "text-ink-2 hover:bg-paper-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="flex-[999_1_420px] min-w-0 flex flex-col gap-5">
          {tab === "account" && (
            <section className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <span className="w-16 h-16 rounded-full bg-neon flex items-center justify-center font-display font-extrabold text-[22px] text-ink">
                  {initials}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold text-[17px] text-ink truncate">{user?.username}</span>
                  <span className="text-[13px] text-muted">
                    {isAdmin ? "Administrateur" : "Utilisateur"}
                    {user?.email && <> · <span className="font-mono">{user.email}</span></>}
                  </span>
                </div>
              </div>

              <div className="card p-[18px] flex flex-col gap-3.5">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">Mot de passe</h2>
                  <p className="text-[13px] text-muted">Au moins 8 caractères.</p>
                </div>
                <label className="label">
                  Mot de passe actuel
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input"
                  />
                </label>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
                  <label className="label">
                    Nouveau mot de passe
                    <SecretInput
                      autoComplete="new-password"
                      minLength={8}
                      value={newPassword}
                      onChange={setNewPassword}
                      shown={showNewPassword}
                      onToggle={() => setShowNewPassword(!showNewPassword)}
                    />
                  </label>
                  <label className="label">
                    Confirmer le mot de passe
                    <SecretInput
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      shown={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                    className="btn-ink"
                  >
                    Modifier le mot de passe
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
                <div>
                  <p className="font-medium text-ink">Sessions</p>
                  <p className="text-sm text-muted">Un appareil perdu ou partagé ? Déconnectez toutes les sessions ouvertes sur votre compte.</p>
                </div>
                <button type="button" onClick={handleLogoutEverywhere} className="btn-danger">
                  Déconnecter partout
                </button>
              </div>
            </section>
          )}

          {isAdmin && tab === "ai" && settingsId !== null && (
            <AiSettings settingsId={settingsId} keySet={ai.keySet} textModel={ai.textModel} imageModel={ai.imageModel} onFeedback={showFeedback} />
          )}

          {isAdmin && tab === "mail" && (
            <section className="flex flex-col gap-4">
              <p className="text-sm text-ink-2">
                Paramètres pour l’envoi d’e-mails (invitations, notifications).
              </p>
              <div className="grid grid-cols-[3fr_1fr] gap-3.5">
                <label className="label min-w-0">
                  Serveur SMTP
                  <SecretInput
                    value={smtpHost}
                    onChange={setSmtpHost}
                    shown={showSmtpHost}
                    onToggle={() => setShowSmtpHost(!showSmtpHost)}
                    placeholder="smtp.exemple.com"
                  />
                </label>
                <label className="label min-w-0">
                  Port
                  <input
                    type="text"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="input font-mono"
                  />
                </label>
              </div>
              <label className="label">
                Utilisateur
                <SecretInput
                  value={smtpUser}
                  onChange={setSmtpUser}
                  shown={showSmtpUser}
                  onToggle={() => setShowSmtpUser(!showSmtpUser)}
                  placeholder="user@exemple.com"
                />
              </label>
              <label className="label">
                Mot de passe
                <SecretInput
                  value={smtpPassword}
                  onChange={setSmtpPassword}
                  shown={showSmtpPassword}
                  onToggle={() => setShowSmtpPassword(!showSmtpPassword)}
                  placeholder={smtpPasswordSet ? "Mot de passe enregistré — saisir pour le remplacer" : undefined}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-line-soft">
                <button type="button" className="btn-secondary">
                  Tester la connexion
                </button>
                <button type="button" onClick={handleSaveSmtp} disabled={saving} className="btn-ink">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </section>
          )}

          {tab === "mcp" && <McpSettings />}
        </div>
      </div>
    </div>
  );
};
