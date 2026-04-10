import React, { useMemo, useState } from "react";
import { useGetCalculations, useGetVersions } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AsyncView } from "@/components/feedback/AsyncView";
import { formatCo2e } from "@/lib/format";
import { compareModuleTotals, compareProductsByName } from "@/lib/versionComparison";
import { ArrowLeftRight, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const MODULE_LABEL: Record<string, string> = {
  "A1-A3": "A1–A3",
  A4: "A4",
  A5: "A5",
  B: "B",
  C: "C",
};

function DeltaCell({ delta, className }: { delta: number; className?: string }) {
  if (delta === 0) {
    return <span className={`text-muted-foreground tabular-nums ${className ?? ""}`}>0</span>;
  }
  const pos = delta > 0;
  return (
    <span
      className={`tabular-nums font-medium ${pos ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"} ${className ?? ""}`}
    >
      {pos ? "+" : ""}
      {formatCo2e(delta)}
    </span>
  );
}

export default function VersionCompare({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const { data: versions = [], isLoading: versionsLoading } = useGetVersions(projectId, {
    query: { enabled: !!projectId },
  });

  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions],
  );

  const [versionIdA, setVersionIdA] = useState<string>("");
  const [versionIdB, setVersionIdB] = useState<string>("");

  const canCompare = Boolean(versionIdA && versionIdB && versionIdA !== versionIdB);

  const calcA = useGetCalculations(versionIdA, {
    query: { enabled: canCompare && !!versionIdA },
  });
  const calcB = useGetCalculations(versionIdB, {
    query: { enabled: canCompare && !!versionIdB },
  });

  const loadingCalc = canCompare && (calcA.isLoading || calcB.isLoading);
  const calcError = calcA.error ?? calcB.error;

  const a = calcA.data;
  const b = calcB.data;

  const moduleRows = useMemo(() => {
    if (!a || !b) return [];
    return compareModuleTotals(a, b);
  }, [a, b]);

  const productRows = useMemo(() => {
    if (!a || !b) return [];
    return compareProductsByName(a, b).slice(0, 25);
  }, [a, b]);

  const grandDelta = a && b ? b.grandTotal - a.grandTotal : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitCompare className="h-8 w-8 text-muted-foreground" />
            Compare versions
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Select two versions from this project. Totals and modules use the same calculation endpoint as reports (
            <span className="font-mono">GET /versions/…/calculations</span>). Product rows are matched by{" "}
            <strong>name</strong> (case-insensitive); duplicate names in one version are summed.
          </p>
        </div>

        <ProjectNav projectId={projectId} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose versions</CardTitle>
            <CardDescription>Both must belong to this project. You only see versions you can access.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="ver-a">Version A (baseline)</Label>
              <Select
                value={versionIdA || undefined}
                onValueChange={setVersionIdA}
                disabled={versionsLoading || sorted.length === 0}
              >
                <SelectTrigger id="ver-a">
                  <SelectValue placeholder="Select version A" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={v.id === versionIdB}>
                      v{v.versionNumber}
                      {v.status === "locked" ? " (locked)" : " (draft)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-center pb-2 text-muted-foreground">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="ver-b">Version B (compare to)</Label>
              <Select
                value={versionIdB || undefined}
                onValueChange={setVersionIdB}
                disabled={versionsLoading || sorted.length === 0}
              >
                <SelectTrigger id="ver-b">
                  <SelectValue placeholder="Select version B" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((v) => (
                    <SelectItem key={v.id} value={v.id} disabled={v.id === versionIdA}>
                      v{v.versionNumber}
                      {v.status === "locked" ? " (locked)" : " (draft)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!canCompare ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">
            {versionIdA && versionIdB && versionIdA === versionIdB
              ? "Choose two different versions."
              : "Pick two versions to see comparison."}
          </p>
        ) : (
          <AsyncView loading={loadingCalc} error={calcError ?? null} loadingMessage="Loading calculations…">
            {a && b ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-mono">
                    A: {a.engineVersion}
                  </Badge>
                  <Badge variant="outline" className="font-mono">
                    B: {b.engineVersion}
                  </Badge>
                  {a.engineVersion !== b.engineVersion ? (
                    <span className="text-amber-700 dark:text-amber-400">Engine versions differ — interpret with care.</span>
                  ) : null}
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Grand total (B − A)</CardTitle>
                    <CardDescription>Official grand totals from the calculation service.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-8">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Version A</p>
                      <p className="text-2xl font-semibold tabular-nums">{formatCo2e(a.grandTotal)} kg</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Version B</p>
                      <p className="text-2xl font-semibold tabular-nums">{formatCo2e(b.grandTotal)} kg</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Delta (B − A)</p>
                      <p className="text-2xl font-semibold tabular-nums flex items-baseline gap-2 flex-wrap">
                        <DeltaCell delta={grandDelta} className="text-2xl font-semibold" />
                        <span className="text-base font-normal text-muted-foreground">kg CO₂e</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">By lifecycle module</CardTitle>
                    <CardDescription>Module totals from the same calculation payloads; delta = B − A.</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead className="text-right">A (kg)</TableHead>
                          <TableHead className="text-right">B (kg)</TableHead>
                          <TableHead className="text-right">Δ (kg)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moduleRows.map((row) => (
                          <TableRow key={row.module}>
                            <TableCell className="font-medium">{MODULE_LABEL[row.module] ?? row.module}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCo2e(row.kgA)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCo2e(row.kgB)}</TableCell>
                            <TableCell className="text-right">
                              <DeltaCell delta={row.delta} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Product name matches (top by |Δ|)</CardTitle>
                    <CardDescription>
                      Included lines only; names matched case-insensitively. Unmatched products appear as A-only or B-only
                      rows. Showing up to 25 rows with the largest absolute change.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">A (kg)</TableHead>
                          <TableHead className="text-right">B (kg)</TableHead>
                          <TableHead className="text-right">Δ (kg)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="max-w-[280px] truncate font-medium" title={row.name}>
                              {row.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatCo2e(row.kgA)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatCo2e(row.kgB)}
                            </TableCell>
                            <TableCell className="text-right">
                              <DeltaCell delta={row.delta} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {productRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No included product lines to compare.</p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </AsyncView>
        )}
      </div>
    </AppLayout>
  );
}
