import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "./api";
import { useAuth } from "./hooks/useAuth";

export const Loginpage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Rediriger si déjà authentifié
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, username: "", password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur de connexion");
      }

      login(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[34px] font-bold tracking-[-0.03em] text-ink">
            Bon retour.
          </h2>
          <p className="text-[15px] text-muted">Connecte-toi à ton espace.</p>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input min-h-[46px] text-[15px]"
            placeholder="Votre mot de passe"
          />
        </label>

        <AuthSubmit loading={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </AuthSubmit>

        <p className="text-[13px] text-muted text-center">
          Pas de compte ? L’accès se fait sur invitation.
        </p>
      </form>
    </AuthShell>
  );
};

// Split-screen frame shared by the login, register and admin-auth pages.
export const AuthShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-frame flex flex-wrap gap-2.5 p-2.5">
    <section className="cover-ink flex-[1_1_420px] min-h-[420px] rounded-[18px] text-white p-8 sm:p-10 flex flex-col justify-between gap-10 overflow-hidden [background-size:18px_18px]">
      <span className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-[11px] bg-neon text-ink flex items-center justify-center font-display font-extrabold text-[22px] -rotate-6">
          t
        </span>
        <span className="font-display font-bold text-xl">tritou</span>
      </span>
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-[52px] sm:text-[76px] leading-[0.95] font-extrabold tracking-[-0.045em]">
          Tes notes.
          <br />
          Le web.
          <br />
          <span className="text-neon">Au même endroit.</span>
        </h1>
        <p className="text-[17px] text-white/70 max-w-[440px] leading-normal">
          Écris, scrape, planifie — et laisse l’assistant IA relier le tout.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[13px]">
        {["Pages & tableurs", "Scrapers JS", "Cron"].map((tag) => (
          <span key={tag} className="px-3 py-1.5 rounded-full bg-white/10 text-white/90">
            {tag}
          </span>
        ))}
        <span className="px-3 py-1.5 rounded-full bg-indigo text-white">Claude intégré</span>
      </div>
    </section>

    <section className="paper flex-[1_1_420px] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[380px]">{children}</div>
    </section>
  </div>
);

export const AuthError = ({ children }: { children: React.ReactNode }) => (
  <div role="alert" className="px-3.5 py-3 rounded-[10px] bg-danger-tint text-danger-ink text-sm">
    {children}
  </div>
);

export const AuthSubmit = ({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) => (
  <button type="submit" disabled={loading} className="btn-ink min-h-12 rounded-xl text-[15px] w-full">
    {children}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-neon"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  </button>
);
