import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../hooks/useAuth";
import { docTypeStyles } from "../utils/docTypes";

interface RecentDocument {
  id: number;
  title: string;
  last_update: string;
  type: "TEXT" | "EXCEL" | "TODO";
}

const Icon = ({ d, className = "w-[17px] h-[17px]" }: { d: string; className?: string }) => (
  <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

const icons = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  code: "m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16",
  database: "M4 5c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3",
  users: "M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4",
  plus: "M12 5v14M5 12h14",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
};


const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="eyebrow px-2.5 pb-1">{children}</div>
);

export const Navigation = () => {
  const { isAuthenticated, logout, user, isAdmin, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [recents, setRecents] = useState<RecentDocument[]>([]);

  // Refetch on navigation so renamed / new documents show up.
  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetch("/api/documents")
      .then((res) => (res.ok ? res.json() : []))
      .then((docs: RecentDocument[]) =>
        setRecents(
          [...docs]
            .sort((a, b) => new Date(b.last_update).getTime() - new Date(a.last_update).getTime())
            .slice(0, 5),
        ),
      )
      .catch(console.error);
  }, [isAuthenticated, location.pathname]);

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    if (path === "/scrapers") return location.pathname.startsWith("/scrapers") || location.pathname.startsWith("/scraper/");
    if (path === "/scraping-schedulers") {
      return location.pathname.startsWith("/scraping-schedulers") || location.pathname.startsWith("/scraping-scheduler/");
    }
    if (path === "/users") return location.pathname.startsWith("/users") || location.pathname.startsWith("/user/");
    return location.pathname.startsWith(path);
  };

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 px-2.5 min-h-9 rounded-[9px] text-sm transition ${
      active
        ? "bg-paper text-ink font-semibold shadow-[0_1px_2px_rgba(28,27,25,0.06),0_0_0_1px_var(--color-line-strong)]"
        : "text-ink-2 hover:bg-black/[0.04]"
    }`;

  const navItem = (to: string, icon: string, label: string) => (
    <Link key={to} to={to} className={itemClass(isActive(to))}>
      <Icon d={icon} />
      <span className="truncate">{label}</span>
    </Link>
  );

  const createPage = async () => {
    const res = await apiFetch("/api/documents", {
      method: "POST",
      body: JSON.stringify({ title: "Sans titre", type: "TEXT" }),
    });
    if (res.ok) {
      const doc = await res.json();
      navigate(`/document/${doc.id}`);
    }
  };

  const showScraping = hasPermission("accessScrapersPage") || hasPermission("accessInstancesScrapersPage");

  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-[18px] px-2.5 py-3.5 text-ink-2">
      <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] min-h-11 hover:bg-black/[0.04]">
        <span className="w-[30px] h-[30px] rounded-[9px] bg-ink text-neon flex items-center justify-center font-display font-extrabold text-lg -rotate-6">
          t
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-display font-bold text-base text-ink tracking-tight">tritou</span>
          <span className="text-xs text-muted truncate">Espace de {user?.username}</span>
        </span>
      </Link>

      <div className="flex flex-col gap-0.5">
        {navItem("/dashboard", icons.home, "Accueil")}
      </div>

      {recents.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Récents</SectionLabel>
          {recents.map((doc) => {
            const style = docTypeStyles[doc.type] ?? docTypeStyles.TEXT;
            return (
              <Link key={doc.id} to={`/document/${doc.id}`} className={itemClass(location.pathname === `/document/${doc.id}`)}>
                <span className={`w-2 h-2 rounded-[3px] shrink-0 ${style.dot}`} />
                <span className="truncate">{doc.title || "Sans titre"}</span>
              </Link>
            );
          })}
        </div>
      )}

      {showScraping && (
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Scraping</SectionLabel>
          {hasPermission("accessScrapersPage") && navItem("/scrapers", icons.code, "Scrapers")}
          {hasPermission("accessInstancesScrapersPage") && navItem("/instances", icons.database, "Instances")}
          {hasPermission("accessScrapersPage") && navItem("/scraping-schedulers", icons.clock, "Planificateurs")}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <SectionLabel>{isAdmin ? "Admin" : "Compte"}</SectionLabel>
        {isAdmin && navItem("/users", icons.users, "Utilisateurs")}
        {navItem("/settings", icons.settings, "Paramètres")}
      </div>

      {hasPermission("createDocument") && (
        <button
          type="button"
          onClick={createPage}
          className="flex items-center justify-center gap-2 min-h-10 rounded-[10px] border-[1.5px] border-dashed border-[#cfcbc2] text-sm font-medium text-ink-2 hover:border-muted hover:text-ink transition cursor-pointer"
        >
          <Icon d={icons.plus} className="w-4 h-4" />
          Nouvelle page
        </button>
      )}

      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-paper-soft border border-line-strong">
        <span className="w-8 h-8 rounded-full bg-neon text-ink flex items-center justify-center font-bold text-xs uppercase shrink-0">
          {user?.username?.slice(0, 2)}
        </span>
        <span className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="font-semibold text-ink text-[13px] truncate">{user?.username}</span>
          <span className="font-mono text-[10px] text-muted tracking-[0.06em]">{isAdmin ? "ADMIN" : "MEMBRE"}</span>
        </span>
        <button type="button" onClick={logout} aria-label="Déconnexion" title="Déconnexion" className="icon-btn w-8 h-8">
          <Icon d={icons.logout} className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
