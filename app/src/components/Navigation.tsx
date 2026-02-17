import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export const Navigation = () => {
  const { isAuthenticated, logout, user, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname.startsWith("/document/");
    }
    if (path === "/scrapers") {
      return location.pathname.startsWith("/scrapers") || location.pathname.startsWith("/scraper/");
    }
    if (path === "/scraping-schedulers") {
      return location.pathname.startsWith("/scraping-schedulers") || location.pathname.startsWith("/scraping-scheduler/");
    }
    if (path === "/users") {
      return location.pathname.startsWith("/users") || location.pathname.startsWith("/user/");
    }
    return location.pathname.startsWith(path);
  };

  const iconLinkClass = (path: string) =>
    `p-2 rounded-md transition ${
      isActive(path)
        ? "bg-gray-600 text-white"
        : "text-gray-400 hover:text-white hover:bg-gray-700"
    }`;

  return (
    <nav className="bg-gray-800 text-white px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Documents */}
          <Link to="/dashboard" className={iconLinkClass("/dashboard")} title="Documents">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </Link>

          {/* Scrapers */}
          <Link to="/scrapers" className={iconLinkClass("/scrapers")} title="Scrapers">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </Link>

          {/* Instances */}
          <Link to="/instances" className={iconLinkClass("/instances")} title="Instances">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </Link>

          {/* Planificateurs */}
          <Link to="/scraping-schedulers" className={iconLinkClass("/scraping-schedulers")} title="Planificateurs">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>

          {/* Utilisateurs */}
          {isAdmin && (
            <Link to="/users" className={iconLinkClass("/users")} title="Utilisateurs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">{user?.username}</span>

          {/* Parametres */}
          {isAdmin && (
            <Link to="/settings" className={iconLinkClass("/settings")} title="Parametres">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}

          {/* Deconnexion */}
          <button
            onClick={logout}
            className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition"
            title="Deconnexion"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};
