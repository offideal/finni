import React from "react";
import { useGetAuditLog, useGetVersionAuditLog } from "@workspace/api-client-react";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";

function formatDiffPreview(preview: unknown): string {
  if (preview == null) return "—";
  try {
    return JSON.stringify(preview, null, 2);
  } catch {
    return String(preview);
  }
}

export default function ProjectAudit({
  params,
}: {
  params: { id: string; versionId?: string };
}) {
  const projectId = params.id;
  const versionId = params.versionId;

  const projectQuery = useGetAuditLog(projectId, {
    query: { enabled: !!projectId && !versionId },
  });
  const versionQuery = useGetVersionAuditLog(projectId, versionId ?? "", {
    query: { enabled: !!projectId && !!versionId },
  });

  const { data: entries, isLoading, isError, error } = versionId ? versionQuery : projectQuery;
  const scopeLabel = versionId ? `Version audit` : "Project audit";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-7 w-7 text-muted-foreground" />
            Audit log
          </h1>
          <p className="text-muted-foreground mt-1">
            Append-only history of significant actions. Entries cannot be edited or deleted from this UI.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <Card>
          <CardHeader>
            <CardTitle>{scopeLabel}</CardTitle>
            <CardDescription>
              {versionId
                ? "Events for this version (version, building, products, exports)."
                : "Events for this project and all its versions."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center">Loading…</p>
            ) : isError ? (
              <p className="text-destructive py-4">
                {error instanceof Error ? error.message : "Could not load audit log."}
              </p>
            ) : !entries?.length ? (
              <p className="text-muted-foreground py-8 text-center">No audit entries yet.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Time (UTC)</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead className="min-w-[240px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground align-top whitespace-nowrap text-xs font-mono">
                          {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm:ss")}
                        </TableCell>
                        <TableCell className="align-top font-medium">{row.action}</TableCell>
                        <TableCell className="align-top text-sm">
                          <span className="text-muted-foreground">{row.entityType}</span>
                          <br />
                          <span className="font-mono text-xs break-all">{row.entityId}</span>
                        </TableCell>
                        <TableCell className="align-top text-sm">{row.userName ?? row.userId}</TableCell>
                        <TableCell className="align-top max-w-md">
                          <ScrollArea className="max-h-32 w-full rounded border bg-muted/30 p-2">
                            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                              {formatDiffPreview(row.diffPreview)}
                            </pre>
                          </ScrollArea>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
