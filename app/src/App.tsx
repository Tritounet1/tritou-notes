import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { Navigation } from "./components/Navigation";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

// Each page is its own chunk: a reader of a public page does not download CodeMirror,
// the scraping pages or the admin screens.
const AdminAuthPage = lazy(() => import("./AdminAuthPage").then((module) => ({ default: module.AdminAuthPage })));
const Dashboard = lazy(() => import("./Dashboard").then((module) => ({ default: module.Dashboard })));
const DocumentPage = lazy(() => import("./DocumentPage").then((module) => ({ default: module.DocumentPage })));
const InstancesScrapePage = lazy(() => import("./InstancesScrapePage").then((module) => ({ default: module.InstancesScrapePage })));
const Loginpage = lazy(() => import("./LoginPage").then((module) => ({ default: module.Loginpage })));
const RegisterPage = lazy(() => import("./RegisterPage").then((module) => ({ default: module.RegisterPage })));
const ScraperPage = lazy(() => import("./ScraperPage").then((module) => ({ default: module.ScraperPage })));
const ScrapersPage = lazy(() => import("./ScrapersPage").then((module) => ({ default: module.ScrapersPage })));
const ScrapingSchedulerPage = lazy(() => import("./ScrapingSchedulerPage").then((module) => ({ default: module.ScrapingSchedulerPage })));
const ScrapingSchedulersPage = lazy(() => import("./ScrapingSchedulersPage").then((module) => ({ default: module.ScrapingSchedulersPage })));
const UserPage = lazy(() => import("./UserPage").then((module) => ({ default: module.UserPage })));
const UsersPage = lazy(() => import("./UsersPage").then((module) => ({ default: module.UsersPage })));
const SettingsPage = lazy(() => import("./SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AssistantPage = lazy(() => import("./AssistantPage").then((module) => ({ default: module.AssistantPage })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then((module) => ({ default: module.CommandPalette })));

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
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPaletteOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell>
        <Suspense fallback={<p className="py-24 text-center text-muted">Chargement…</p>}>
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
            path="/assistant"
            element={
              <ProtectedRoute>
                <AssistantPage />
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
        </Suspense>
        </Shell>
      </BrowserRouter>
    </AuthProvider>
  );
};
