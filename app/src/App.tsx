import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminAuthPage } from "./AdminAuthPage";
import { AuthProvider } from "./components/AuthProvider";
import { Navigation } from "./components/Navigation";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Dashboard } from "./Dashboard";
import { DocumentPage } from "./DocumentPage";
import { InstancesScrapePage } from "./InstancesScrapePage";
import { Loginpage } from "./LoginPage";
import { ScraperPage } from "./ScraperPage";
import { ScrapersPage } from "./ScrapersPage";

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Loginpage />} />
          {/*
          <Route path="/register" element={<RegisterPage />} />
            */}
          <Route path="/admin-auth" element={<AdminAuthPage />} />
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
          <Route
            path="/scrapers"
            element={
              <ProtectedRoute>
                <ScrapersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scraper/:id"
            element={
              <ProtectedRoute>
                <ScraperPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instances"
            element={
              <ProtectedRoute>
                <InstancesScrapePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
