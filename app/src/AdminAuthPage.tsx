import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "./api";
import { useAuth } from "./hooks/useAuth";
import { AuthError, AuthShell, AuthSubmit } from "./LoginPage";

export const AdminAuthPage = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!code) {
      setError("Code d'invitation manquant");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    // Same rule as the API (bcrypt ignores what lies beyond 72 bytes).
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setError("Le mot de passe doit contenir au moins 8 caractères et au maximum 72 octets.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/admin-auth/${code}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erreur lors de l'inscription");
      }

      // Le cookie est déjà défini par le backend
      login(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'inscription",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!code) {
    return (
      <AuthShell>
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-[34px] font-bold tracking-[-0.03em] text-ink">
            Accès refusé
          </h2>
          <p className="text-[15px] text-muted">
            Code d’invitation requis pour accéder à cette page.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <span className="pill bg-ink text-neon self-start mb-1">Admin</span>
          <h2 className="font-display text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink">
            Créer un compte administrateur
          </h2>
        </div>

        {error && <AuthError>{error}</AuthError>}

        <label className="label">
          Nom d’utilisateur
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="input min-h-[46px] text-[15px]"
            placeholder="Votre pseudo"
          />
        </label>

        <label className="label">
          Email
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input min-h-[46px] text-[15px]"
            placeholder="votre@email.com"
          />
        </label>

        <label className="label">
          Mot de passe
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input min-h-[46px] text-[15px]"
            placeholder="Minimum 8 caractères"
          />
        </label>

        <label className="label">
          Confirmer le mot de passe
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="input min-h-[46px] text-[15px]"
            placeholder="Confirmez votre mot de passe"
          />
        </label>

        <AuthSubmit loading={loading}>
          {loading ? "Création…" : "Créer le compte admin"}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};
