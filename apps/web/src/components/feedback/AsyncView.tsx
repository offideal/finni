import React from "react";
import { AlertCircle } from "lucide-react";

type AsyncViewProps = {
  loading: boolean;
  error: Error | null | undefined;
  loadingMessage?: string;
  children: React.ReactNode;
};

/** Shared loading / error shell for React Query results (no layout assumptions). */
export function AsyncView({ loading, error, loadingMessage = "Loading…", children }: AsyncViewProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
        <div className="h-8 w-8 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        {loadingMessage}
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Could not load data</p>
          <p className="mt-1 opacity-90">{error.message || "Request failed"}</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

type EmptyProps = {
  when: boolean;
  message: string;
  children: React.ReactNode;
};

export function EmptyState({ when, message, children }: EmptyProps) {
  if (when) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">{message}</div>
    );
  }
  return <>{children}</>;
}
