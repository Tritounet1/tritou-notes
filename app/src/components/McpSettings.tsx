import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useConfirm } from "../hooks/useConfirm";

interface McpToken {
  id: number;
  name: string;
  readOnly: boolean;
  created_at: string;
  last_used_at: string | null;
}

type Client = "code-cli" | "code-json" | "desktop";

const CLIENTS: [Client, string][] = [
  ["code-cli", "Claude Code (CLI)"],
  ["code-json", "Claude Code (.mcp.json)"],
  ["desktop", "Claude Desktop"],
];

// Production setups proxy /mcp on the app's domain (see the README); override with VITE_MCP_URL.
const defaultMcpUrl = import.meta.env.VITE_MCP_URL || `${window.location.origin}/mcp`;

const snippet = (client: Client, url: string, token: string) => {
  const auth = `Authorization: Bearer ${token}`;
  if (client === "code-cli") {
    return `claude mcp add --transport http tritou-notes ${url} \\\n  --header "${auth}"`;
  }
  const config =
    client === "code-json"
      ? { mcpServers: { "tritou-notes": { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }
      : { mcpServers: { "tritou-notes": { command: "npx", args: ["-y", "mcp-remote", url, "--header", auth] } } };
  return JSON.stringify(config, null, 2);
};

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="icon-btn h-8 w-8 shrink-0 text-stone hover:bg-white/10 hover:text-white"
    >
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="m5 12 5 5 9-10" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>}
      </svg>
    </button>
  );
};

const formatDate = (value: string) => new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Paramètres › MCP: the user's personal MCP tokens (create, revoke) and client configurations.
 * The MCP server acts as the token's user, with their permissions; read-only tokens only read.
 */
export const McpSettings = () => {
  const [confirm, confirmDialog] = useConfirm();
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  // Plain token, only known right after its creation.
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState(defaultMcpUrl);
  const [client, setClient] = useState<Client>("code-cli");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/mcp-tokens")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then(setTokens)
      .catch(() => setError("Impossible de charger vos jetons MCP."));
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/mcp-tokens", { method: "POST", body: JSON.stringify({ name, readOnly }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Impossible de créer le jeton");
      const { token: plain, ...created } = data;
      setToken(plain);
      setTokens((list) => [created, ...(list ?? [])]);
      setName("");
      setReadOnly(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (target: McpToken) => {
    if (!(await confirm({ title: `Révoquer « ${target.name} » ?`, message: "Les clients MCP qui l’utilisent ne pourront plus se connecter.", confirmLabel: "Révoquer" }))) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/mcp-tokens/${target.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Impossible de révoquer le jeton");
      setTokens((list) => (list ?? []).filter((t) => t.id !== target.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const config = snippet(client, url, token ?? "VOTRE_TOKEN");

  return (
    <section className="flex flex-col gap-[18px]">
      {confirmDialog}
      <div className="p-5 rounded-2xl bg-indigo-tint flex gap-3.5 items-start">
        <span className="w-10 h-10 flex-none rounded-xl bg-indigo text-white flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <b className="text-[15px] text-ink">Serveur MCP</b>
          <span className="text-sm text-ink-2">
            Permet à Claude (Code ou Desktop) de travailler dans l’app avec vos permissions. Un jeton par appareil ou par usage ; « lecture seule » ne donne que les outils qui lisent. Gardez vos jetons secrets.
          </span>
        </div>
      </div>

      {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger-ink">{error}</p>}

      <form onSubmit={create} className="card p-4 flex flex-wrap items-end gap-3">
        <label className="label flex-1 min-w-[200px]">
          Nom du jeton
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code, portable" maxLength={80} className="input" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2 pb-2.5">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
          Lecture seule
        </label>
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary">Créer un jeton</button>
      </form>

      {token && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-[14px] bg-ink pl-4 pr-2 py-2">
            <code className="flex-1 min-w-0 truncate font-mono text-[13px] text-neon">{token}</code>
            <CopyButton value={token} label="Copier le jeton" />
          </div>
          <p className="text-[13px] text-coral-ink">Copiez-le maintenant : il ne sera plus jamais affiché.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {tokens === null ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted">Aucun jeton : le serveur MCP refuse les connexions tant que vous n’en créez pas.</p>
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="card p-4 flex flex-wrap items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${t.last_used_at ? "bg-neon-dot" : "bg-muted"}`} />
              <div className="flex-1 min-w-[200px] flex flex-col">
                <span className="text-sm font-semibold text-ink">
                  {t.name} {t.readOnly && <span className="pill ml-1">lecture seule</span>}
                </span>
                <span className="text-[13px] text-muted">
                  Créé le {formatDate(t.created_at)} · {t.last_used_at ? `utilisé le ${formatDate(t.last_used_at)}` : "jamais utilisé"}
                </span>
              </div>
              <button type="button" onClick={() => void revoke(t)} disabled={busy} className="btn-danger">Révoquer</button>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3 pt-2 border-t border-line-soft">
        <h2 className="section-title text-lg">Connecter un client</h2>
        <label className="label">
          URL du serveur MCP
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="input font-mono text-[13px]" />
        </label>
        <div className="segmented self-start flex-wrap" role="group" aria-label="Client MCP">
          {CLIENTS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={client === key} onClick={() => setClient(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-[14px] bg-code overflow-hidden">
          <div className="flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-code-line">
            <span className="font-mono text-xs text-code-faint">
              {client === "code-cli" ? "terminal" : client === "code-json" ? ".mcp.json (racine du projet)" : "claude_desktop_config.json"}
            </span>
            <CopyButton value={config} label="Copier la configuration" />
          </div>
          <pre className="m-0 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-code-ink overflow-x-auto">{config}</pre>
        </div>
        {!token && (
          <p className="text-[13px] text-muted">
            Remplacez <code className="font-mono text-ink">VOTRE_TOKEN</code> par un jeton copié lors de sa création.
          </p>
        )}
      </div>
    </section>
  );
};
