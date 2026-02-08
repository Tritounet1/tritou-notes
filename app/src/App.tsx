import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminAuthPage } from "./AdminAuthPage";
import { AuthProvider } from "./components/AuthProvider";
import { Navigation } from "./components/Navigation";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Dashboard } from "./Dashboard";
import { DocumentPage } from "./DocumentPage";
import { InstancesScrapePage } from "./InstancesScrapePage";
import { Loginpage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { ScraperPage } from "./ScraperPage";
import { ScrapersPage } from "./ScrapersPage";
import { ScrapingSchedulerPage } from "./ScrapingSchedulerPage";
import { ScrapingSchedulersPage } from "./ScrapingSchedulersPage";
import { UserPage } from "./UserPage";
import { UsersPage } from "./UsersPage";

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navigation />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Loginpage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin-auth" element={<AdminAuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/document/:id" element={<DocumentPage />} />
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
          <Route
            path="/scraping-schedulers"
            element={
              <ProtectedRoute>
                <ScrapingSchedulersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scraping-scheduler/:id"
            element={
              <ProtectedRoute>
                <ScrapingSchedulerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/:id"
            element={
              <ProtectedRoute>
                <UserPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
