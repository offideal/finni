import React from "react";
import { useLocation } from "wouter";
import {
  useGetVersions,
  useCloneVersion,
  useCreateVersion,
  useLockVersion,
  getGetVersionsQueryKey,
  getGetVersionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Plus, ArrowRight, FileText, Lock } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { AsyncView } from "@/components/feedback/AsyncView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { lockFailureToast } from "@/lib/apiErrorBody";

export default function ProjectVersions({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isTenantEditor, isReviewerOrAdmin } = useAuth();

  const {
    data: versions,
    isLoading,
    isError,
    error,
  } = useGetVersions(projectId, { query: { enabled: !!projectId } });

  const cloneVersion = useCloneVersion();
  const createVersion = useCreateVersion();
  const lockVersion = useLockVersion();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createNotes, setCreateNotes] = React.useState("");
  const [cloneNotes, setCloneNotes] = React.useState("");
  /** Source version id for the clone dialog. */
  const [cloneTargetId, setCloneTargetId] = React.useState<string | null>(null);
  /** Version id for lock confirmation dialog. */
  const [lockTargetId, setLockTargetId] = React.useState<string | null>(null);

  const latestVersionId = versions?.[0]?.id;
  const cloneSource = versions?.find((v) => v.id === cloneTargetId);
  const lockTarget = versions?.find((v) => v.id === lockTargetId);

  const listError = isError ? (error instanceof Error ? error : new Error("Failed to load versions")) : null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetVersionsQueryKey(projectId) });
  };

  const handleCreateDraft = async () => {
    try {
      const v = await createVersion.mutateAsync({
        projectId,
        data: { notes: createNotes.trim() || undefined },
      });
      invalidate();
      setCreateOpen(false);
      setCreateNotes("");
      toast({
        title: "Draft version created",
        description: `Version v${v.versionNumber} is ready. Open it to add building data and products.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create version",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleConfirmLock = async () => {
    if (!lockTargetId) return;
    try {
      await lockVersion.mutateAsync({
        versionId: lockTargetId,
        data: {},
      });
      invalidate();
      queryClient.invalidateQueries({ queryKey: getGetVersionQueryKey(lockTargetId) });
      setLockTargetId(null);
      toast({
        title: "Version locked",
        description: "This version is now read-only. Clone it to continue editing in a new draft.",
      });
    } catch (e: unknown) {
      const { title, description } = lockFailureToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const handleClone = async (sourceVersionId: string) => {
    try {
      const newVersion = await cloneVersion.mutateAsync({
        projectId,
        data: {
          sourceVersionId,
          notes: cloneNotes.trim() || undefined,
        },
      });
      invalidate();
      setCloneTargetId(null);
      setCloneNotes("");
      toast({
        title: "Version cloned",
        description: `Created draft v${newVersion.versionNumber} with the same products and building snapshot (ordered deterministically).`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Clone failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Versions</h1>
            <p className="text-muted-foreground mt-1">
              Draft versions are editable. Locked versions are read-only; clone one to continue with a new draft. Identifiers are unique per
              project (v1, v2, …).
            </p>
          </div>
          {isTenantEditor ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New draft version
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create empty draft</DialogTitle>
                  <DialogDescription>
                    Adds the next version number with no products and an empty building row. Use this to start a fresh scenario, or clone an
                    existing version instead to copy data.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="create-notes">Notes (optional)</Label>
                  <Input
                    id="create-notes"
                    placeholder="e.g. Option B – timber frame"
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void handleCreateDraft()} disabled={createVersion.isPending}>
                    {createVersion.isPending ? "Creating…" : "Create draft"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        <ProjectNav projectId={projectId} versionId={latestVersionId} />

        <AsyncView loading={isLoading} error={listError} loadingMessage="Loading versions…">
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Locked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!versions || versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No versions yet. Create a draft or open the project dashboard—new projects include v1 automatically.
                    </TableCell>
                  </TableRow>
                ) : (
                  versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-medium">v{version.versionNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant={version.status === "locked" ? "default" : "secondary"}
                          className={version.status === "draft" ? "bg-amber-100 text-amber-800 border-amber-200" : ""}
                        >
                          {version.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground text-sm" title={version.notes ?? undefined}>
                        {version.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(version.createdAt), "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{version.createdByName ?? "—"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {version.lockedAt ? (
                          <div className="text-sm">
                            <div>{format(new Date(version.lockedAt), "MMM d, yyyy")}</div>
                            <div className="text-xs text-muted-foreground">{version.lockedByName ?? "—"}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/projects/${projectId}/versions/${version.id}/products`)}
                          >
                            Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                          {isTenantEditor ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCloneTargetId(version.id);
                                setCloneNotes("");
                              }}
                              disabled={cloneVersion.isPending}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" /> Clone
                            </Button>
                          ) : null}
                          {isReviewerOrAdmin && version.status === "draft" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setLockTargetId(version.id)}
                              disabled={lockVersion.isPending}
                            >
                              <Lock className="mr-1 h-3.5 w-3.5" /> Lock
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </AsyncView>

        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <FileText className="h-4 w-4 shrink-0 mt-0.5" />
          Admins and reviewers can lock a draft from this list or from the validation page (same server checks). Branching and merge are not
          supported.
        </p>

        <Dialog
          open={cloneTargetId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCloneTargetId(null);
              setCloneNotes("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{cloneSource ? `Clone v${cloneSource.versionNumber}` : "Clone version"}</DialogTitle>
              <DialogDescription>
                Products are copied in stable id order; building spaces and gross area are duplicated. The server verifies counts match before
                completing the clone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="clone-notes">Notes for new version (optional)</Label>
              <Input
                id="clone-notes"
                value={cloneNotes}
                onChange={(e) => setCloneNotes(e.target.value)}
                placeholder="e.g. What-if — higher recycled content"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloneTargetId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => cloneTargetId && void handleClone(cloneTargetId)}
                disabled={cloneVersion.isPending || !cloneTargetId}
              >
                {cloneVersion.isPending ? "Cloning…" : "Clone"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={lockTargetId !== null}
          onOpenChange={(open) => {
            if (!open) setLockTargetId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Lock {lockTarget ? `version v${lockTarget.versionNumber}` : "version"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The version becomes read-only for products and building data. Reports and audit remain available. All validation rules must
                pass on the server before the lock succeeds.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button type="button" onClick={() => void handleConfirmLock()} disabled={lockVersion.isPending}>
                {lockVersion.isPending ? "Locking…" : "Lock version"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
