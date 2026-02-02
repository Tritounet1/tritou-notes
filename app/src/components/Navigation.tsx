import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export const Navigation = () => {
  const { isAuthenticated, logout, user } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <nav className="bg-gray-800 text-white px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold text-lg hover:text-gray-300">
            Documents
          </Link>
          <Link to="/scrapers" className="font-semibold text-lg hover:text-gray-300">
            Scrapers
          </Link>
          <Link to="/instances" className="font-semibold text-lg hover:text-gray-300">
            Instances
          </Link>
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
