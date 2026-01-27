import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Dashboard } from "./Dashboard";
import { DocumentPage } from "./DocumentPage";
import { Home } from "./Home";
import "./index.css";
import { Loginpage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

const Navigation = () => {
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <nav className="bg-gray-800 text-white px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          {isAuthenticated ? (
            <Link to="/dashboard" className="hover:text-gray-300">
              Dashboard
            </Link>
          ) : (
            <Link to="/" className="font-semibold text-lg hover:text-gray-300">
              Accueil
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <span className="text-sm text-gray-300">{user?.username}</span>
              <button
                onClick={logout}
                className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-1.5 text-sm hover:text-gray-300"
              >
                Connexion
              </Link>
              <Link
                to="/register"
                className="px-4 py-1.5 text-sm bg-white text-gray-800 rounded-md hover:bg-gray-100 transition"
              >
                Inscription
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Loginpage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/document/:id"
            element={
              <ProtectedRoute>
                <DocumentPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
