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

  const linkClass = (path: string) =>
    `font-semibold text-lg transition ${
      isActive(path)
        ? "text-white border-b-2 border-white pb-1"
        : "text-gray-400 hover:text-white"
    }`;

  return (
    <nav className="bg-gray-800 text-white px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Documents
          </Link>
          <Link to="/scrapers" className={linkClass("/scrapers")}>
            Scrapers
          </Link>
          <Link to="/instances" className={linkClass("/instances")}>
            Instances
          </Link>
          <Link to="/scraping-schedulers" className={linkClass("/scraping-schedulers")}>
            Planificateurs
          </Link>
          {isAdmin && (
            <Link to="/users" className={linkClass("/users")}>
              Utilisateurs
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">{user?.username}</span>
          <button
            onClick={logout}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  );
};
