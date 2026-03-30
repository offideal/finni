import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function ProjectNav({ projectId, versionId }: { projectId: string; versionId?: string }) {
  const [location] = useLocation();

  const isExact = (path: string) => location === path;
  
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
        variant={isExact(`/projects/${projectId}/building`) ? "secondary" : "ghost"} 
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}/building`}>Building Info</Link>
      </Button>
      
      <Button 
        variant={isExact(`/projects/${projectId}/versions`) ? "secondary" : "ghost"} 
        asChild
        className="text-sm font-medium h-8"
      >
        <Link href={`/projects/${projectId}/versions`}>Versions</Link>
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
        </>
      )}
    </div>
  );
}
