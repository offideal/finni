import React from "react";
import {
  useGetReports,
  useGetVersion,
  useGeneratePdfReport,
  useGenerateXlsxReport,
  getGetReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { describeApiError, parseApiErrorJson } from "@/lib/apiErrorBody";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, FileSpreadsheet, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProjectReports({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const { data: reports, isLoading } = useGetReports(versionId, { query: { enabled: !!versionId } });

  const pdfMutation = useGeneratePdfReport({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey(versionId) });
        toast({ title: "PDF ready", description: "The report was generated. Download it from the list below." });
      },
      onError: (err) => {
        const j = parseApiErrorJson(err);
        const detail = [j?.error, j?.summary].filter(Boolean).join(" — ") || describeApiError(err);
        toast({ title: "PDF export failed", description: detail, variant: "destructive" });
      },
    },
  });

  const xlsxMutation = useGenerateXlsxReport({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey(versionId) });
        toast({ title: "Excel ready", description: "The export was generated. Download it from the list below." });
      },
      onError: (err) => {
        const j = parseApiErrorJson(err);
        const detail = [j?.error, j?.summary].filter(Boolean).join(" — ") || describeApiError(err);
        toast({ title: "Excel export failed", description: detail, variant: "destructive" });
      },
    },
  });

  const isLocked = version?.status === "locked";
  const exportBusy = pdfMutation.isPending || xlsxMutation.isPending;

  const handleGeneratePdf = () => {
    pdfMutation.mutate({ versionId });
  };

  const handleGenerateXlsx = () => {
    xlsxMutation.mutate({ versionId });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Exports</h1>
          <p className="text-muted-foreground mt-1">
            Generate and download compliance reports.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        {!isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start gap-3 mb-6">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-amber-800">Draft Version</h3>
              <p className="text-sm text-amber-700 mt-1">
                You can generate reports for draft versions, but they will be watermarked. Lock the version in Validation to generate official reports.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-500" />
                Official PDF Report
              </CardTitle>
              <CardDescription>Standardized format for compliance submission.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleGeneratePdf} disabled={exportBusy}>
                {pdfMutation.isPending ? "Generating…" : "Generate New PDF"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                Data Export (Excel)
              </CardTitle>
              <CardDescription>Raw calculation data and product breakdowns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline" onClick={handleGenerateXlsx} disabled={exportBusy}>
                {xlsxMutation.isPending ? "Generating…" : "Generate New Excel"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-4">Generated Reports</h2>
          <div className="bg-card border rounded-lg shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Generated At</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : !reports || reports.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No reports generated yet.</TableCell></TableRow>
                ) : (
                  reports.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {r.type === "PDF" ? <FileText className="h-4 w-4 text-red-500" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
                          {r.type} Report
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(r.createdAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/reports/${r.id}/download`} target="_blank" rel="noreferrer">
                            <Download className="mr-2 h-4 w-4" /> Download
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
