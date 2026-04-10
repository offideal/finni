import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";

export function ProjectNav({ projectId, versionId }: { projectId: string; versionId?: string }) {
  const [location] = useLocation();

  const isExact = (path: string) => location === path;

  const buildingPath = versionId
    ? `/projects/${projectId}/versions/${versionId}/building`
    : `/projects/${projectId}/versions`;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b pb-4 mb-6">
      <Button
        variant={isExact(`/projects/${projectId}`) ? "secondary" : "ghost"}
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}`}>Dashboard</Link>
      </Button>

      <Button
        variant={versionId && isExact(buildingPath) ? "secondary" : "ghost"}
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={buildingPath}>{versionId ? "Building Info" : "Building (pick version)"}</Link>
      </Button>

      <Button
        variant={isExact(`/projects/${projectId}/versions`) ? "secondary" : "ghost"}
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}/versions`}>Versions</Link>
      </Button>

      <Button
        variant={isExact(`/projects/${projectId}/version-compare`) ? "secondary" : "ghost"}
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}/version-compare`} className="inline-flex items-center gap-1.5">
          <GitCompare className="h-4 w-4 shrink-0" />
          Compare
        </Link>
      </Button>

      <Button
        variant={isExact(`/projects/${projectId}/audit`) ? "secondary" : "ghost"}
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}/audit`}>Project audit</Link>
      </Button>

      {versionId && (
        <>
          <div className="h-4 w-px bg-border mx-2" />

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/products`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/products`}>Products</Link>
          </Button>

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/calculation`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/calculation`}>Calculation</Link>
          </Button>

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/reporting`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/reporting`}>Reporting</Link>
          </Button>

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/validation`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/validation`}>Validation</Link>
          </Button>

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/reports`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/reports`}>Reports</Link>
          </Button>

          <Button
            variant={isExact(`/projects/${projectId}/versions/${versionId}/audit`) ? "secondary" : "ghost"}
            asChild
            className="text-sm font-medium h-8"
          >
            <Link href={`/projects/${projectId}/versions/${versionId}/audit`}>Audit</Link>
          </Button>
        </>
      )}
    </div>
  );
}
