import React, { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RequireAuth } from "@/lib/auth";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <RequireAuth>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-y-auto">
          <div className="flex-1 w-full max-w-7xl mx-auto p-8">
            {children}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
