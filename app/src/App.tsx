import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
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
import { SettingsPage } from "./SettingsPage";
import { useAuth } from "./hooks/useAuth";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./components/CommandPalette";

// One DocumentPage per document: switching between sub-pages remounts it, which
// flushes the previous page's pending save instead of mixing the two pages' state.
const DocumentRoute = () => <DocumentPage key={useParams().id} />;

// Signed-in pages sit on a white "paper" sheet next to the sidebar; auth pages get the bare frame.
const Shell = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated]);

  if (!isAuthenticated) return <>{children}</>;
  return (
    <div className="min-h-screen flex flex-wrap items-start">
      <div className="flex-[1_1_248px] max-w-full min-[840px]:sticky min-[840px]:top-0 min-[840px]:max-h-screen min-[840px]:overflow-y-auto">
        <Navigation onSearch={() => setPaletteOpen(true)} />
      </div>
      <main className="paper flex-[999_1_560px] min-w-0 m-2.5 min-h-[calc(100vh-20px)] overflow-hidden">{children}</main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell>
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
          <Route path="/document/:id" element={<DocumentRoute />} />
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
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
        </Shell>
      </BrowserRouter>
    </AuthProvider>
  );
};
