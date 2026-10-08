import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "./api";
import { useAuth } from "./hooks/useAuth";
import { AuthError, AuthShell, AuthSubmit } from "./LoginPage";

export const RegisterPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  // Rediriger si déjà authentifié
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(!!token);
  const [tokenValid, setTokenValid] = useState(false);

  // Vérification du token d'invitation
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/admin-auth/invitation/${token}`,
          { credentials: "include" },
        );
        const data = await response.json();

        if (response.ok) {
          setEmail(data.email);
          setTokenValid(true);
        } else {
          setError(data.message || "Invitation invalide");
        }
      } catch {
        setError("Erreur de connexion au serveur");
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      let response;

      if (token && tokenValid) {
        // Inscription via invitation
        response = await fetch(`${API_URL}/api/admin-auth/invitation/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
      } else {
        // Inscription classique (si autorisée)
        response = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, username, password }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erreur lors de l'inscription");
      }

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

  if (verifying) {
    return (
      <AuthShell>
        <p className="py-24 text-center text-muted">Vérification de l’invitation…</p>
      </AuthShell>
    );
  }

  // Token invalide ou expiré
  if (token && !tokenValid) {
    return (
      <AuthShell>
        <div className="flex flex-col items-start gap-4">
          <span className="w-12 h-12 rounded-xl bg-danger-tint text-danger-ink flex items-center justify-center">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
          <h2 className="font-display text-[34px] font-bold tracking-[-0.03em] text-ink">
            Invitation invalide
          </h2>
          <p className="text-[15px] text-muted">
            {error || "Ce lien d’invitation n’est pas valide ou a expiré."}
          </p>
          <button type="button" onClick={() => navigate("/login")} className="btn-secondary">
            Retour à la connexion
          </button>
        </div>
      </AuthShell>
    );
  }

  const invited = !!(token && tokenValid);

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          {invited && (
            <span className="pill bg-neon-tint text-neon-ink self-start mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-dot" />
              Invitation
            </span>
          )}
          <h2 className="font-display text-[34px] font-bold tracking-[-0.03em] text-ink">
            {invited ? "Créer votre compte" : "Inscription"}
          </h2>
          {invited && (
            <p className="text-[15px] text-muted">
              Vous avez été invité à rejoindre la plateforme.
            </p>
          )}
        </div>

        {error && <AuthError>{error}</AuthError>}

        <label className="label">
          Email
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={invited}
            required
            className="input min-h-[46px] text-[15px] disabled:bg-chip disabled:text-muted"
            placeholder="votre@email.com"
          />
        </label>

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
          {loading ? "Création…" : "Créer mon compte"}
        </AuthSubmit>

        {!token && (
          <p className="text-[13px] text-muted text-center">
            Déjà un compte ?{" "}
            <Link to="/login" className="font-semibold text-indigo-ink hover:text-ink">
              Connectez-vous
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
};
