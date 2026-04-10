import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";

import LoginPage from "@/pages/login";
import ProjectsPage from "@/pages/projects";
import ProjectDashboard from "@/pages/projects/dashboard";
import ProjectBuilding from "@/pages/projects/building";
import ProjectVersions from "@/pages/projects/versions";
import ProjectProducts from "@/pages/projects/products";
import ProjectCalculation from "@/pages/projects/calculation";
import ProjectReportingDashboard from "@/pages/projects/reporting";
import ProjectValidation from "@/pages/projects/validation";
import ProjectReports from "@/pages/projects/reports";
import ProjectAudit from "@/pages/projects/audit";
import VersionCompare from "@/pages/projects/version-compare";
import UsersPage from "@/pages/settings/users";
import TenantEpdSettingsPage from "@/pages/settings/epd";

const queryClient = new QueryClient();

function ProtectedRoute({ path, component: Component }: { path: string, component: any }) {
  return (
    <Route path={path}>
      {(params) => {
        const { user, isLoading } = useAuth();
        if (isLoading) return null;
        if (!user) return <Redirect to="/login" />;
        return <Component params={params} />;
      }}
    </Route>
  );
}

function RootRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to="/projects" />;
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={RootRoute} />
      
      <ProtectedRoute path="/projects" component={ProjectsPage} />
      <ProtectedRoute path="/projects/:id/version-compare" component={VersionCompare} />
      <ProtectedRoute path="/projects/:id" component={ProjectDashboard} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/building" component={ProjectBuilding} />
      <ProtectedRoute path="/projects/:id/versions" component={ProjectVersions} />
      
      <ProtectedRoute path="/projects/:id/versions/:versionId/products" component={ProjectProducts} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/calculation" component={ProjectCalculation} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/reporting" component={ProjectReportingDashboard} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/validation" component={ProjectValidation} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/reports" component={ProjectReports} />
      <ProtectedRoute path="/projects/:id/versions/:versionId/audit" component={ProjectAudit} />
      <ProtectedRoute path="/projects/:id/audit" component={ProjectAudit} />

      <ProtectedRoute path="/settings/users" component={UsersPage} />
      <ProtectedRoute path="/settings/epd" component={TenantEpdSettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
