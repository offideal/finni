import React from "react";
import { Link, useLocation } from "wouter";
import {
  useGetVersions,
  useCloneVersion,
  useLockVersion,
  getGetVersionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Lock, ArrowRight } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function ProjectVersions({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isReviewerOrAdmin } = useAuth();

  const { data: versions, isLoading } = useGetVersions(projectId, { query: { enabled: !!projectId } });
  const cloneVersion = useCloneVersion();
  const lockVersion = useLockVersion();

  const handleClone = async (versionId: string) => {
    try {
      const newVersion = await cloneVersion.mutateAsync({ projectId, data: { sourceVersionId: versionId } });
      queryClient.invalidateQueries({ queryKey: getGetVersionsQueryKey(projectId) });
      toast({ title: "Version cloned", description: `Created new draft version v${newVersion.versionNumber}` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.message || "Failed to clone version" });
    }
  };

  const handleLock = async (versionId: string) => {
    if (!confirm("Are you sure you want to lock this version? This action cannot be undone and will make all products read-only.")) return;
    try {
      await lockVersion.mutateAsync({ versionId, data: { notes: "Manually locked" } });
      queryClient.invalidateQueries({ queryKey: getGetVersionsQueryKey(projectId) });
      toast({ title: "Version locked" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Lock failed", description: e?.message });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Version History</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage all calculation versions for this project.
          </p>
        </div>

        <ProjectNav projectId={projectId} />

        <div className="bg-card border rounded-lg shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Locked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8"><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : !versions || versions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No versions found.
                  </TableCell>
                </TableRow>
              ) : (
                versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium">v{version.versionNumber}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={version.status === "locked" ? "default" : "secondary"}
                        className={version.status === "draft" ? "bg-amber-100 text-amber-800" : ""}
                      >
                        {version.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{format(new Date(version.createdAt), "MMM d, yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{version.createdByName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {version.lockedAt ? (
                        <div className="text-sm">
                          <div>{format(new Date(version.lockedAt), "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{version.lockedByName}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setLocation(`/projects/${projectId}/versions/${version.id}/products`)}
                        >
                          Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                        {version.status === "locked" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleClone(version.id)}
                            disabled={cloneVersion.isPending}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Clone
                          </Button>
                        )}
                        {/* We will handle locking in the validation page primarily, as it requires checks to pass, 
                            but we can leave a hook here if needed. Hiding for safety. */}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
