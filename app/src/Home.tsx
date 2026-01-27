import { Link } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

export const Home = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Bienvenue sur notre plateforme
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Une solution simple et efficace pour gérer vos données.
          </p>

          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-block px-6 py-3 bg-gray-800 text-white font-medium rounded-md hover:bg-gray-700 transition"
            >
              Accéder au Dashboard
            </Link>
          ) : (
            <div className="flex justify-center gap-4">
              <Link
                to="/register"
                className="px-6 py-3 bg-gray-800 text-white font-medium rounded-md hover:bg-gray-700 transition"
              >
                Commencer gratuitement
              </Link>
              <Link
                to="/login"
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-100 transition"
              >
                Se connecter
              </Link>
            </div>
          )}
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Rapide</h3>
            <p className="text-sm text-gray-600">
              Interface performante et réactive pour une expérience fluide.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Sécurisé</h3>
            <p className="text-sm text-gray-600">
              Vos données sont protégées avec les meilleures pratiques.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Simple</h3>
            <p className="text-sm text-gray-600">
              Interface intuitive, prise en main immédiate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
