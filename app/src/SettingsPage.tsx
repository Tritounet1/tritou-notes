import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useAuth } from "./hooks/useAuth";
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
  anthropicApiKey: string | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  mcpTokenSet: boolean;
  mcpTokenCreatedAt: string | null;
}

export const SettingsPage = () => {
  const { isAdmin, user } = useAuth();
  const [tab, setTab] = useState<"account" | "ai" | "mail" | "mcp">("account");
  const [mcp, setMcp] = useState({ tokenSet: false, createdAt: null as string | null });
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Anthropic API
  const [anthropicKey, setAnthropicKey] = useState("");

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
  const [smtpPassword, setSmtpPassword] = useState("");
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
            setAnthropicKey(s.anthropicApiKey || "");
            setSmtpHost(s.smtpHost || "");
            setSmtpPort(s.smtpPort?.toString() || "587");
            setSmtpUser(s.smtpUser || "");
            setSmtpPassword(s.smtpPassword || "");
            setMcp({ tokenSet: s.mcpTokenSet, createdAt: s.mcpTokenCreatedAt });
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

  const saveSettings = async (data: Partial<Settings>) => {
    if (!isAdmin || !settingsId || saving) return;
    setSaving(true);
    try {
      const response = await apiFetch(`/api/settings/${settingsId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (response.ok) {
        showFeedback("success", "Paramètres enregistrés");
      } else {
        showFeedback("error", "Erreur lors de la sauvegarde");
      }
    } catch {
      showFeedback("error", "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAnthropicKey = () => {
    saveSettings({ anthropicApiKey: anthropicKey });
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
        showFeedback("error", data.error || "Erreur lors du changement de mot de passe");
      }
    } catch {
      showFeedback("error", "Erreur lors du changement de mot de passe");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmtp = () => {
    saveSettings({
      smtpHost,
      smtpPort: smtpPort ? parseInt(smtpPort) : null,
      smtpUser,
      smtpPassword,
    });
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
          ["mcp", "MCP"],
        ]
      : []),
  ] as ["account" | "ai" | "mail" | "mcp", string][];

  const initials = (user?.username ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-[1000px] mx-auto px-6 sm:px-10 pt-10 pb-16 flex flex-col gap-7">
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
            </section>
          )}

          {isAdmin && tab === "ai" && (
            <section className="flex flex-col gap-[18px]">
              <div className="p-5 rounded-2xl bg-indigo-tint flex gap-3.5 items-start">
                <span className="w-10 h-10 flex-none rounded-xl bg-indigo text-white flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <div className="flex flex-col gap-1">
                  <b className="text-[15px] text-ink">API Anthropic</b>
                  <span className="text-sm text-ink-2">
                    Clé API utilisée par Claude dans le chat IA, partagée par tout l’espace.
                  </span>
                </div>
              </div>
              <label className="label">
                Clé API Anthropic
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="input font-mono text-[13px]"
                />
              </label>
              <div className="flex justify-end pt-2 border-t border-line-soft">
                <button type="button" onClick={handleSaveAnthropicKey} disabled={saving} className="btn-ink">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </section>
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

          {isAdmin && tab === "mcp" && <McpSettings tokenSet={mcp.tokenSet} createdAt={mcp.createdAt} />}
        </div>
      </div>
    </div>
  );
};
