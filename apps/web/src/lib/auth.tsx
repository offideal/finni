import React, { createContext, useContext, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** Admin or editor — can create/edit projects and tenant data (see TENANT_EDITOR_ROLES). */
  isTenantEditor: boolean;
  /** Admin or editor — can manage tenant-specific EPD / emission factor records. */
  canManageTenantEpd: boolean;
  isReviewerOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
    },
  });

  const authUser = user || null;
  const isAdmin = authUser?.role === "admin";
  const isTenantEditor = isAdmin || authUser?.role === "editor";
  const canManageTenantEpd = isTenantEditor;
  const isReviewerOrAdmin = isAdmin || authUser?.role === "reviewer";

  return (
    <AuthContext.Provider
      value={{ user: authUser, isLoading, isAdmin, isTenantEditor, canManageTenantEpd, isReviewerOrAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    // We'll let the App.tsx handle redirect to /login
    return null;
  }

  return <>{children}</>;
}
