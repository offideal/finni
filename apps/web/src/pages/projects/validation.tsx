import React from "react";
import { Link } from "wouter";
import {
  useGetValidation,
  useLockVersion,
  useGetVersion,
  getGetValidationQueryKey,
  getGetVersionQueryKey,
  getGetVersionsQueryKey,
} from "@workspace/api-client-react";
import type { ValidationCheck, ValidationFixTarget } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Lock, ArrowRight, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { lockFailureToast } from "@/lib/apiErrorBody";
import { AsyncView } from "@/components/feedback/AsyncView";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const GROUP_ORDER: Array<ValidationCheck["group"]> = [
  "project",
  "building",
  "data_quality",
  "products",
  "calculation",
];

function groupLabel(g: ValidationCheck["group"]): string {
  switch (g) {
    case "building":
      return "Building";
    case "products":
      return "Products";
    case "project":
      return "Project";
    case "calculation":
      return "Lifecycle modules";
    case "data_quality":
      return "Data quality";
    default:
      return g;
  }
}

function fixHref(projectId: string, versionId: string, target: ValidationFixTarget): string {
  const base = `/projects/${projectId}/versions/${versionId}`;
  switch (target.kind) {
    case "building":
      return `${base}/building`;
    case "products":
      return `${base}/products`;
    case "calculation":
      return `${base}/calculation`;
    case "product":
      return `${base}/products`;
    default:
      return base;
  }
}

function sortChecks(checks: ValidationCheck[]): ValidationCheck[] {
  const rank = (g: ValidationCheck["group"]) => {
    const i = GROUP_ORDER.indexOf(g);
    return i === -1 ? 99 : i;
  };
  return [...checks].sort((a, b) => {
    const ga = rank(a.group);
    const gb = rank(b.group);
    if (ga !== gb) return ga - gb;
    return a.id.localeCompare(b.id);
  });
}

export default function ProjectValidation({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const { isReviewerOrAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const {
    data: validation,
    isLoading,
    isError,
    error: validationError,
  } = useGetValidation(versionId, { query: { enabled: !!versionId } });
  const lockVersion = useLockVersion();

  const isLocked = version?.status === "locked";

  const handleLock = async () => {
    try {
      await lockVersion.mutateAsync({ versionId, data: { notes: "Locked after validation pass" } });
      queryClient.invalidateQueries({ queryKey: getGetVersionQueryKey(versionId) });
      queryClient.invalidateQueries({ queryKey: getGetVersionsQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getGetValidationQueryKey(versionId) });
      toast({ title: "Version locked successfully", description: "This version is now read-only." });
    } catch (e: unknown) {
      const { title, description } = lockFailureToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const listError = isError
    ? validationError instanceof Error
      ? validationError
      : new Error("Failed to load validation")
    : null;

  const checks = validation?.checks ? sortChecks(validation.checks) : [];
  const blockingFailed = checks.filter((c) => c.severity === "error" && !c.passed);
  const warningFailed = checks.filter((c) => c.severity === "warning" && !c.passed);
  const infoFailed = checks.filter((c) => c.severity === "info" && !c.passed);
  const passedVisible = checks.filter((c) => c.passed && c.severity !== "info");
  const infoChecks = checks.filter((c) => c.severity === "info");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Validation</h1>
          <p className="text-muted-foreground mt-1">
            Central rule engine: <strong>blocking</strong> (errors) must pass to lock; <strong>warnings</strong> should be reviewed;{" "}
            <strong>informational</strong> rows add context and never block lock.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <AsyncView loading={isLoading} error={listError} loadingMessage="Running validation…">
          {validation ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Summary</CardTitle>
                    <CardDescription>
                      Same rules apply when locking a version (server-side). Engine is deterministic for a given version snapshot.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3 text-sm">
                    <Badge variant={validation.passed ? "default" : "destructive"}>
                      {validation.passed ? "Ready to lock" : "Blocking issues open"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Blocking: {validation.summary.blockingFailed} open · {validation.summary.blockingPassed} ok
                    </span>
                    <span className="text-muted-foreground">
                      Warnings: {validation.summary.warningFailed} open · {validation.summary.warningPassed} ok
                    </span>
                    <span className="text-muted-foreground">
                      Info: {validation.summary.infoFailed} notes · {validation.summary.infoPassed} context rows
                    </span>
                  </CardContent>
                </Card>

                {blockingFailed.length > 0 ? (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
                      <XCircle className="h-4 w-4" /> Blocking (errors)
                    </h2>
                    <div className="space-y-3">
                      {blockingFailed.map((check) => (
                        <ValidationCheckCard
                          key={check.id}
                          check={check}
                          projectId={projectId}
                          versionId={versionId}
                          tone="error"
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="rounded-lg border border-green-200 bg-green-50/40 px-4 py-3 text-sm text-green-900 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    No blocking validation errors.
                  </div>
                )}

                {warningFailed.length > 0 ? (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Warnings
                    </h2>
                    <div className="space-y-3">
                      {warningFailed.map((check) => (
                        <ValidationCheckCard
                          key={check.id}
                          check={check}
                          projectId={projectId}
                          versionId={versionId}
                          tone="warning"
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {infoFailed.length > 0 ? (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-sky-900 flex items-center gap-2">
                      <Info className="h-4 w-4" /> Informational (attention)
                    </h2>
                    <div className="space-y-3">
                      {infoFailed.map((check) => (
                        <ValidationCheckCard
                          key={check.id}
                          check={check}
                          projectId={projectId}
                          versionId={versionId}
                          tone="info"
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {infoChecks.length > 0 ? (
                  <section className="space-y-2 rounded-lg border border-sky-200/80 bg-sky-50/50 dark:bg-sky-950/20 px-4 py-3">
                    <h2 className="text-sm font-semibold text-sky-900 dark:text-sky-100 flex items-center gap-2">
                      <Info className="h-4 w-4" /> Context ({infoChecks.length})
                    </h2>
                    <ul className="space-y-1.5 text-sm text-sky-950/90 dark:text-sky-50/90">
                      {infoChecks.map((check) => (
                        <li key={check.id} className="flex gap-2">
                          <span className="text-xs uppercase tracking-wide text-sky-800/80 dark:text-sky-200/80 shrink-0">
                            {groupLabel(check.group)}
                          </span>
                          <span>{check.message}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Passed blocking / warning checks ({passedVisible.length})
                  </h2>
                  {passedVisible.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm border rounded-lg divide-y bg-card">
                      {passedVisible.map((check) => (
                        <li key={check.id} className="flex gap-3 items-start px-3 py-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">{groupLabel(check.group)}</span>
                            <p className="font-medium">{check.message}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <div>
                <Card>
                  <CardHeader>
                    <CardTitle>Lock version</CardTitle>
                    <CardDescription>Reviewers and admins can lock when blocking checks pass.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col items-center justify-center py-4 bg-muted/30 rounded-md">
                      {validation.passed ? (
                        <>
                          <CheckCircle2 className="h-12 w-12 text-green-600 mb-2" />
                          <div className="font-medium text-lg text-green-700">Ready to lock</div>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-12 w-12 text-destructive mb-2" />
                          <div className="font-medium text-lg text-destructive">Action required</div>
                        </>
                      )}
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      disabled={isLocked || !validation.passed || !isReviewerOrAdmin || lockVersion.isPending}
                      onClick={handleLock}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      {isLocked ? "Already locked" : "Lock version"}
                    </Button>

                    {!isReviewerOrAdmin && !isLocked && (
                      <p className="text-xs text-center text-muted-foreground">Only reviewers and admins can lock versions.</p>
                    )}
                    {!validation.passed && !isLocked && isReviewerOrAdmin && (
                      <p className="text-xs text-center text-destructive">Resolve all blocking checks to enable lock.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </AsyncView>
      </div>
    </AppLayout>
  );
}

function ValidationCheckCard({
  check,
  projectId,
  versionId,
  tone,
}: {
  check: ValidationCheck;
  projectId: string;
  versionId: string;
  tone: "error" | "warning" | "info";
}) {
  const href = check.fixTarget ? fixHref(projectId, versionId, check.fixTarget) : null;
  const fixLabel =
    check.fixTarget?.kind === "building"
      ? "Open building"
      : check.fixTarget?.kind === "calculation"
        ? "Open module allocation"
        : check.fixTarget?.kind === "product"
          ? "Open products"
          : check.fixTarget?.kind === "products"
            ? "Open products"
            : "Go to fix";

  return (
    <Card
      className={cn(
        tone === "error"
          ? "border-red-200 bg-red-50/30"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50/30"
            : "border-sky-200 bg-sky-50/40 dark:bg-sky-950/30",
      )}
    >
      <div className="p-4 flex gap-4 items-start">
        <div className="mt-0.5">
          {tone === "error" ? (
            <XCircle className="h-5 w-5 text-red-600" />
          ) : tone === "warning" ? (
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          ) : (
            <Info className="h-5 w-5 text-sky-700 dark:text-sky-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{groupLabel(check.group)}</p>
          <h3 className="font-medium text-foreground">{check.message}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {tone === "error"
              ? "Must be resolved before locking."
              : tone === "warning"
                ? "Review recommended."
                : "Does not block locking."}
          </p>
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-2 hover:underline"
            >
              {fixLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
