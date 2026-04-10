import React from "react";
import { Link, useLocation } from "wouter";
import {
  useGetProject,
  useGetVersions,
  useGetBuilding,
  useGetValidation,
  useGetCalculations,
  useUpdateProject,
  useArchiveProject,
  useUnarchiveProject,
  getGetProjectQueryKey,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  ListTree,
  Calculator,
  Pencil,
  Archive,
  ArchiveRestore,
  History,
  GitCompare,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCo2e } from "@/lib/format";
import { AsyncView } from "@/components/feedback/AsyncView";
import { ExternalCo2AdminCard } from "@/components/emission/ExternalCo2AdminCard";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  locationCountry: z.string().min(1, "Country is required"),
  buildingType: z.string().min(1, "Building type is required"),
});

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export default function ProjectDashboard({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { isTenantEditor, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = React.useState(false);

  const {
    data: project,
    isLoading: isProjectLoading,
    error: projectError,
  } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: versions } = useGetVersions(projectId, { query: { enabled: !!projectId } });

  const latestVersion = versions?.length
    ? versions.reduce((prev, current) => (prev.versionNumber > current.versionNumber ? prev : current))
    : null;
  const versionId = latestVersion?.id;

  const { data: building } = useGetBuilding(projectId, versionId ?? "", {
    query: { enabled: !!projectId && !!versionId },
  });

  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();
  const unarchiveProject = useUnarchiveProject();

  const form = useForm<z.infer<typeof editProjectSchema>>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: { name: "", locationCountry: "FI", buildingType: "office" },
  });

  React.useEffect(() => {
    if (!project) return;
    form.reset({
      name: project.name,
      locationCountry: project.locationCountry,
      buildingType: project.buildingType,
    });
  }, [project, form]);

  const { data: validation } = useGetValidation(versionId || "", { query: { enabled: !!versionId } });
  const { data: calculation } = useGetCalculations(versionId || "", { query: { enabled: !!versionId } });

  const isArchived = Boolean(project?.archivedAt);

  const invalidateProjectQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const onSaveMetadata = async (data: z.infer<typeof editProjectSchema>) => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        data: {
          name: data.name,
          locationCountry: data.locationCountry,
          buildingType: data.buildingType,
        },
      });
      invalidateProjectQueries();
      setEditOpen(false);
      toast({ title: "Project updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update project", description: errMessage(e) });
    }
  };

  const onArchive = async () => {
    try {
      await archiveProject.mutateAsync({ id: projectId });
      invalidateProjectQueries();
      setArchiveConfirmOpen(false);
      toast({ title: "Project archived" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not archive", description: errMessage(e) });
    }
  };

  const onRestore = async () => {
    try {
      await unarchiveProject.mutateAsync({ id: projectId });
      invalidateProjectQueries();
      toast({ title: "Project restored" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not restore", description: errMessage(e) });
    }
  };

  if (isProjectLoading) {
    return (
      <AppLayout>
        <Skeleton className="h-[600px] w-full" />
      </AppLayout>
    );
  }
  if (projectError) {
    return (
      <AppLayout>
        <AsyncView loading={false} error={projectError} />
      </AppLayout>
    );
  }
  if (!project) {
    return (
      <AppLayout>
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Project not found or you do not have access.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {isArchived ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
            role="status"
          >
            <Archive className="h-5 w-5 shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium">This project is archived</p>
              <p className="opacity-90 mt-0.5">
                Building data, versions, and reports are read-only until you restore the project.
              </p>
            </div>
            {isTenantEditor ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void onRestore()} disabled={unarchiveProject.isPending}>
                <ArchiveRestore className="h-4 w-4 mr-2" />
                Restore project
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              {isArchived ? (
                <Badge variant="outline" className="border-amber-600/50 text-amber-900 dark:text-amber-100">
                  Archived
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1">
              {project.locationCountry} • <span className="capitalize">{project.buildingType}</span>
            </p>
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectId}/audit`}>
                  <History className="h-4 w-4 mr-2" />
                  Project audit log
                </Link>
              </Button>
            </div>
          </div>
          {isTenantEditor ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={isArchived}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit details
              </Button>
              {!isArchived ? (
                <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setArchiveConfirmOpen(true)}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        {isAdmin ? <ExternalCo2AdminCard /> : null}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit project details</DialogTitle>
              <DialogDescription>Update the name, location, and building type for this project.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSaveMetadata)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="locationCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="buildingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Building type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="office">Office</SelectItem>
                            <SelectItem value="residential">Residential</SelectItem>
                            <SelectItem value="commercial">Commercial</SelectItem>
                            <SelectItem value="industrial">Industrial</SelectItem>
                            <SelectItem value="educational">Educational</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateProject.isPending}>
                    {updateProject.isPending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this project?</AlertDialogTitle>
              <AlertDialogDescription>
                You can still view data, but editing building info, versions, products, and generating new reports will be blocked until
                you restore the project.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void onArchive()}
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Latest Version</span>
                {latestVersion ? (
                  <Badge
                    variant={latestVersion.status === "locked" ? "default" : "secondary"}
                    className={latestVersion.status === "draft" ? "bg-amber-100 text-amber-800" : ""}
                  >
                    v{latestVersion.versionNumber} {latestVersion.status}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">No versions yet</span>
                )}
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Gross Area</span>
                <span className="font-medium">{building?.grossAreaM2 ? `${building.grossAreaM2} m²` : "Not set"}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Spaces Defined</span>
                <span className="font-medium">{building?.spaces?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{format(new Date(project.createdAt), "MMM d, yyyy")}</span>
              </div>

              <Button
                variant="outline"
                className="w-full mt-2"
                disabled={isArchived || !versionId}
                title={
                  isArchived
                    ? "Restore the project to edit building data"
                    : !versionId
                      ? "No version yet"
                      : undefined
                }
                onClick={() =>
                  versionId && setLocation(`/projects/${projectId}/versions/${versionId}/building`)
                }
              >
                Edit Building Info
              </Button>
            </CardContent>
          </Card>

          {latestVersion ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Latest Calculation (v{latestVersion.versionNumber})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-md flex justify-between items-center">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total CO2e</div>
                    <div className="text-3xl font-bold">
                      {calculation ? formatCo2e(calculation.grandTotal, { maximumFractionDigits: 0 }) : "..."}
                      <span className="text-base font-normal text-muted-foreground ml-1">kg CO2e</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2">
                  {validation ? (
                    validation.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                  )}
                  <span className="text-sm font-medium">
                    {validation
                      ? validation.passed
                        ? "All validations passed"
                        : "Validation issues found"
                      : "Checking validation..."}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setLocation(`/projects/${projectId}/versions/${versionId}/products`)}
                  >
                    <ListTree className="mr-2 h-4 w-4" />
                    Products
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setLocation(`/projects/${projectId}/versions/${versionId}/calculation`)}
                  >
                    <Calculator className="mr-2 h-4 w-4" />
                    Calculation
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setLocation(`/projects/${projectId}/versions/${versionId}/reporting`)}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    CO₂ reporting
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => setLocation(`/projects/${projectId}/versions`)}>
                    <FileText className="mr-2 h-4 w-4" />
                    All Versions
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setLocation(`/projects/${projectId}/version-compare`)}
                  >
                    <GitCompare className="mr-2 h-4 w-4" />
                    Compare versions
                  </Button>
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    onClick={() => setLocation(`/projects/${projectId}/versions/${versionId}/reports`)}
                  >
                    <ChevronRight className="mr-2 h-4 w-4" />
                    Export Reports
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">No Versions Found</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col items-center justify-center py-10">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-center">
                  This project doesn&apos;t have any versions yet. Usually a draft is created automatically.
                </p>
                <Button onClick={() => window.location.reload()}>Refresh</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
