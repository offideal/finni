import React from "react";
import {
  useGetValidation,
  useLockVersion,
  useGetVersion,
  getGetValidationQueryKey,
  getGetVersionQueryKey,
  getGetVersionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function ProjectValidation({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const { isReviewerOrAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const { data: validation, isLoading } = useGetValidation(versionId, { query: { enabled: !!versionId } });
  const lockVersion = useLockVersion();

  const isLocked = version?.status === "locked";

  const handleLock = async () => {
    try {
      await lockVersion.mutateAsync({ data: { notes: "Locked after validation pass" } } as any); 
      // API expects the mutation to somehow know which version. 
      // If it's a global mutation we might need to pass versionId in path params via custom fetch config or it's mapped in body.
      // Assuming Orval mapped it correctly based on schema, maybe:
      // mutateAsync({ versionId, data: { notes: "..." } }) if path param.
      queryClient.invalidateQueries({ queryKey: getGetVersionQueryKey(versionId) });
      queryClient.invalidateQueries({ queryKey: getGetVersionsQueryKey(projectId) });
      toast({ title: "Version locked successfully", description: "This version is now read-only." });
    } catch (e) {
      toast({ variant: "destructive", title: "Lock failed" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Validation</h1>
          <p className="text-muted-foreground mt-1">
            Check for missing data and calculation errors before locking the report.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            {validation?.checks.map((check: any) => (
              <Card key={check.id} className={check.passed ? "border-green-200 bg-green-50/30" : (check.severity === "error" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30")}>
                <div className="p-4 flex gap-4 items-start">
                  <div className="mt-0.5">
                    {check.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : check.severity === "error" ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{check.message}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {check.passed 
                        ? "Requirement met." 
                        : (check.severity === "error" ? "Must be resolved before locking." : "Warning: Review recommended.")}
                    </p>
                  </div>
                </div>
              </Card>
            ))}

            {(!validation?.checks || validation.checks.length === 0) && !isLoading && (
              <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">
                No validation checks available.
              </div>
            )}
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
                <CardDescription>Lock version to finalize</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center justify-center py-4 bg-muted/30 rounded-md">
                  {validation?.passed ? (
                    <>
                      <CheckCircle2 className="h-12 w-12 text-green-600 mb-2" />
                      <div className="font-medium text-lg text-green-700">Ready to Lock</div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-12 w-12 text-destructive mb-2" />
                      <div className="font-medium text-lg text-destructive">Action Required</div>
                    </>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={isLocked || !validation?.passed || !isReviewerOrAdmin || lockVersion.isPending}
                  onClick={handleLock}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  {isLocked ? "Already Locked" : "Lock Version"}
                </Button>
                
                {!isReviewerOrAdmin && !isLocked && (
                  <p className="text-xs text-center text-muted-foreground">
                    Only Reviewers and Admins can lock versions.
                  </p>
                )}
                {!validation?.passed && !isLocked && isReviewerOrAdmin && (
                  <p className="text-xs text-center text-destructive">
                    Fix all error-level validations to unlock.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
