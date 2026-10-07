import { useState } from "react";
import { apiFetch } from "../api";
import { useConfirm } from "../hooks/useConfirm";

interface McpSettingsProps {
  tokenSet: boolean;
  createdAt: string | null;
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
      className="icon-btn h-8 w-8 shrink-0 text-[#bdbab2] hover:bg-white/10 hover:text-white"
    >
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="m5 12 5 5 9-10" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>}
      </svg>
    </button>
  );
};

/** Paramètres › MCP: generate / regenerate / revoke the MCP server token and show client configs. */
export const McpSettings = ({ tokenSet: initialSet, createdAt: initialCreatedAt }: McpSettingsProps) => {
  const [confirm, confirmDialog] = useConfirm();
  const [tokenSet, setTokenSet] = useState(initialSet);
  const [createdAt, setCreatedAt] = useState(initialCreatedAt);
  // Plain token, only known right after generation.
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState(defaultMcpUrl);
  const [client, setClient] = useState<Client>("code-cli");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (
      tokenSet &&
      !(await confirm({
        title: "Régénérer le token MCP ?",
        message: "L’ancien token cessera immédiatement de fonctionner : il faudra mettre à jour la configuration de tous les clients MCP.",
        confirmLabel: "Régénérer",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/settings/mcp-token", { method: "POST" });
      if (!res.ok) throw new Error("Impossible de générer le token");
      const data = await res.json();
      setToken(data.token);
      setCreatedAt(data.createdAt);
      setTokenSet(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (
      !(await confirm({
        title: "Révoquer le token MCP ?",
        message: "Plus aucun client ne pourra se connecter au serveur MCP tant qu’un nouveau token n’aura pas été généré.",
        confirmLabel: "Révoquer",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/settings/mcp-token", { method: "DELETE" });
      if (!res.ok) throw new Error("Impossible de révoquer le token");
      setToken(null);
      setTokenSet(false);
      setCreatedAt(null);
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
            Permet à Claude (Code ou Desktop) de lire et modifier les pages, scrapers et planificateurs. Le token donne un accès complet aux données : gardez-le secret.
          </span>
        </div>
      </div>

      {error && <p role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger-ink">{error}</p>}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${tokenSet ? "bg-neon-dot" : "bg-muted"}`} />
        <div className="flex-1 min-w-[200px] flex flex-col">
          <span className="text-sm font-semibold text-ink">{tokenSet ? "Token actif" : "Aucun token"}</span>
          <span className="text-[13px] text-muted">
            {tokenSet && createdAt
              ? `Généré le ${new Date(createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`
              : "Le serveur MCP refuse toutes les connexions tant qu’aucun token n’est généré."}
          </span>
        </div>
        {tokenSet && (
          <button type="button" onClick={revoke} disabled={busy} className="btn-danger">
            Révoquer
          </button>
        )}
        <button type="button" onClick={generate} disabled={busy} className={tokenSet ? "btn-secondary" : "btn-primary"}>
          {tokenSet ? "Régénérer" : "Générer un token"}
        </button>
      </div>

      {token && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-[14px] bg-ink pl-4 pr-2 py-2">
            <code className="flex-1 min-w-0 truncate font-mono text-[13px] text-neon">{token}</code>
            <CopyButton value={token} label="Copier le token" />
          </div>
          <p className="text-[13px] text-coral-ink">Copiez-le maintenant : il ne sera plus jamais affiché.</p>
        </div>
      )}

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
          <div className="flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-[#2e2e2e]">
            <span className="font-mono text-xs text-[#9c9a94]">
              {client === "code-cli" ? "terminal" : client === "code-json" ? ".mcp.json (racine du projet)" : "claude_desktop_config.json"}
            </span>
            <CopyButton value={config} label="Copier la configuration" />
          </div>
          <pre className="m-0 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-[#e6e4de] overflow-x-auto">{config}</pre>
        </div>
        {!token && (
          <p className="text-[13px] text-muted">
            Remplacez <code className="font-mono text-ink">VOTRE_TOKEN</code> par le token copié lors de sa génération{tokenSet ? ", ou régénérez-en un" : ""}.
          </p>
        )}
      </div>
    </section>
  );
};
