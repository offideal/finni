/** Parsed JSON body from failed API responses (see api ErrorResponse + lock/products extensions). */
export type ApiErrorJson = {
  error?: string;
  code?: string;
  summary?: string;
  failedChecks?: Array<{ id: string; message: string }>;
  /** Per-field messages from product validation (server). */
  fieldErrors?: Record<string, string>;
};

export function parseApiErrorJson(e: unknown): ApiErrorJson | null {
  if (!e || typeof e !== "object") return null;
  if (!("data" in e)) return null;
  const data = (e as { data: unknown }).data;
  if (!data || typeof data !== "object") return null;
  return data as ApiErrorJson;
}

/** User-facing description: prefers server `error`, then Error.message. */
export function describeApiError(e: unknown): string {
  const j = parseApiErrorJson(e);
  if (j?.error) return j.error;
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export function blockedEditToast(e: unknown): { title: string; description: string } {
  const j = parseApiErrorJson(e);
  if (j?.code === "VERSION_LOCKED" || (j?.error?.includes("locked") ?? false)) {
    return {
      title: "Version is read-only",
      description: j?.error ?? "This version is locked. Clone it or create a new draft to edit.",
    };
  }
  if (j?.code === "PROJECT_ARCHIVED" || (j?.error?.includes("archived") ?? false)) {
    return {
      title: "Project is archived",
      description: j?.error ?? "Changes are not allowed for this project.",
    };
  }
  return {
    title: "Could not save",
    description: describeApiError(e),
  };
}

export function lockFailureToast(e: unknown): { title: string; description: string } {
  const j = parseApiErrorJson(e);
  if (j?.code === "LOCK_PRECONDITIONS_FAILED" && j.failedChecks?.length) {
    const lines = j.failedChecks.slice(0, 5).map((c) => c.message);
    const more =
      j.failedChecks.length > 5 ? ` … and ${j.failedChecks.length - 5} more.` : "";
    return {
      title: "Cannot lock yet",
      description: `${j.summary ? `${j.summary}. ` : ""}${lines.join(" · ")}${more}`,
    };
  }
  return {
    title: "Lock failed",
    description: describeApiError(e),
  };
}
