import React from "react";
import { Link, useLocation } from "wouter";
import {
  useGetProject,
  useGetVersions,
  useGetBuilding,
  useGetValidation,
  useGetCalculations,
} from "@workspace/api-client-react";
import { format } from "date-fns";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, ChevronRight, FileText, ListTree, Calculator } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCo2e } from "@/lib/format";
import { AsyncView } from "@/components/feedback/AsyncView";

export default function ProjectDashboard({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [, setLocation] = useLocation();

  const {
    data: project,
    isLoading: isProjectLoading,
    error: projectError,
  } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: versions, isLoading: isVersionsLoading } = useGetVersions(projectId, { query: { enabled: !!projectId } });
  const { data: building, isLoading: isBuildingLoading } = useGetBuilding(projectId, { query: { enabled: !!projectId } });

  const latestVersion = versions?.length ? versions.reduce((prev, current) => (prev.versionNumber > current.versionNumber) ? prev : current) : null;
  const versionId = latestVersion?.id;

  const { data: validation } = useGetValidation(versionId || "", { query: { enabled: !!versionId } });
  const { data: calculation } = useGetCalculations(versionId || "", { query: { enabled: !!versionId } });

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground mt-1">
            {project.locationCountry} • <span className="capitalize">{project.buildingType}</span>
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

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
                onClick={() => setLocation(`/projects/${projectId}/building`)}
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
                    {validation ? (validation.passed ? "All validations passed" : "Validation issues found") : "Checking validation..."}
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
                    onClick={() => setLocation(`/projects/${projectId}/versions`)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    All Versions
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
                  This project doesn't have any versions yet. Usually a draft is created automatically.
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
