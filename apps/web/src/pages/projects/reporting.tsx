import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  useGetCalculations,
  useGetProducts,
  useGetVersion,
} from "@workspace/api-client-react";
import type { CalculationProductLine } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AsyncView, EmptyState } from "@/components/feedback/AsyncView";
import { formatCo2e } from "@/lib/format";
import { PRODUCT_CATEGORIES } from "@/lib/productFields";
import {
  BarChart3,
  Calculator,
  ClipboardCheck,
  FileText,
  ListTree,
  PieChart,
} from "lucide-react";

const MODULE_LABELS: Record<string, string> = {
  "A1-A3": "A1–A3",
  A4: "A4",
  A5: "A5",
  B: "B",
  C: "C",
};

const MODULE_ORDER = ["A1-A3", "A4", "A5", "B", "C"] as const;

function categorySortKey(cat: string): number {
  const i = PRODUCT_CATEGORIES.indexOf(cat as (typeof PRODUCT_CATEGORIES)[number]);
  return i >= 0 ? i : 999;
}

function aggregateByCategory(
  lines: CalculationProductLine[],
  categoryByProductId: Map<string, string>,
): { category: string; co2e: number }[] {
  const m = new Map<string, number>();
  for (const line of lines) {
    if (line.eligibility !== "included" || line.co2eTotal == null) continue;
    const cat = categoryByProductId.get(line.id) ?? "other";
    m.set(cat, (m.get(cat) ?? 0) + line.co2eTotal);
  }
  return [...m.entries()]
    .map(([category, co2e]) => ({ category, co2e }))
    .sort((a, b) => {
      if (b.co2e !== a.co2e) return b.co2e - a.co2e;
      return categorySortKey(a.category) - categorySortKey(b.category);
    });
}

export default function ProjectReportingDashboard({
  params,
}: {
  params: { id: string; versionId: string };
}) {
  const { id: projectId, versionId } = params;

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const calcQuery = useGetCalculations(versionId, { query: { enabled: !!versionId } });
  const productsQuery = useGetProducts(versionId, { query: { enabled: !!versionId } });

  const loading = calcQuery.isLoading || productsQuery.isLoading;
  const error = calcQuery.error ?? productsQuery.error;

  const categoryById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsQuery.data ?? []) {
      m.set(p.id, p.category);
    }
    return m;
  }, [productsQuery.data]);

  const categoryRows = useMemo(() => {
    const calc = calcQuery.data;
    if (!calc) return [];
    return aggregateByCategory(calc.products, categoryById);
  }, [calcQuery.data, categoryById]);

  const topProducts = useMemo(() => {
    const calc = calcQuery.data;
    if (!calc) return [];
    return calc.products
      .filter((p) => p.eligibility === "included" && p.co2eTotal != null && p.co2eTotal > 0)
      .sort((a, b) => (b.co2eTotal ?? 0) - (a.co2eTotal ?? 0))
      .slice(0, 8);
  }, [calcQuery.data]);

  const moduleBars = useMemo(() => {
    const calc = calcQuery.data;
    if (!calc || calc.grandTotal <= 0) return [];
    return MODULE_ORDER.map((key) => {
      const mod = calc.modules.find((m) => m.module === key);
      const kg = mod?.co2eTotal ?? 0;
      const pct = (kg / calc.grandTotal) * 100;
      return { key, kg, pct };
    });
  }, [calcQuery.data]);

  const calc = calcQuery.data;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            CO₂ reporting dashboard
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Summary uses the same calculation as exports and the calculation view (engine{" "}
            <span className="font-mono text-foreground">{calc?.engineVersion ?? "—"}</span>
            ). Category totals join product metadata to official line totals—only for grouping labels.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <AsyncView loading={loading} error={error ?? null} loadingMessage="Loading calculation results…">
          <EmptyState
            when={!calc}
            message="No calculation data."
          >
            {calc ? (
              <div className="space-y-6">
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {version ? `Version ${version.versionNumber}` : "Version"}
                  </span>
                  {version?.status === "locked" ? (
                    <span className="ml-2 rounded border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-foreground">
                      Locked
                    </span>
                  ) : (
                    <span className="ml-2 rounded border px-2 py-0.5 text-xs">Draft</span>
                  )}
                  <span className="mx-2">·</span>
                  Computed{" "}
                  <time dateTime={calc.computedAt} className="font-mono text-foreground">
                    {new Date(calc.computedAt).toLocaleString()}
                  </time>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Total kg CO₂e</CardTitle>
                      <CardDescription>Sum of module contributions (official engine output).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-4xl font-semibold tabular-nums tracking-tight">
                        {formatCo2e(calc.grandTotal, { maximumFractionDigits: 0 })}
                        <span className="ml-2 text-lg font-normal text-muted-foreground">kg CO₂e</span>
                      </p>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {calc.summary.includedInCalculation} product row(s) included ·{" "}
                        {calc.summary.excludedIncomplete} excluded (incomplete data)
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <PieChart className="h-4 w-4" />
                        By lifecycle module
                      </CardTitle>
                      <CardDescription>Share of total (each bar = module total ÷ grand total).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {calc.grandTotal <= 0 ? (
                        <p className="text-sm text-muted-foreground">No attributable emissions yet.</p>
                      ) : (
                        moduleBars.map(({ key, kg, pct }) => (
                          <div key={key}>
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="font-medium">{MODULE_LABELS[key] ?? key}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {formatCo2e(kg)} kg · {pct.toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/80 transition-[width]"
                                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">By material category</CardTitle>
                      <CardDescription>
                        Sums official line totals grouped by product category (labels from product data).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {categoryRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No included product lines with emissions.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">kg CO₂e</TableHead>
                              <TableHead className="text-right w-[90px]">Share</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryRows.map((row) => {
                              const share =
                                calc.grandTotal > 0 ? (row.co2e / calc.grandTotal) * 100 : 0;
                              return (
                                <TableRow key={row.category}>
                                  <TableCell className="capitalize">{row.category}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {formatCo2e(row.co2e)}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                                    {share.toFixed(1)}%
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Largest product lines</CardTitle>
                      <CardDescription>Highest total CO₂e among included rows (official line totals).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {topProducts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No qualifying products yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">kg CO₂e</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topProducts.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="max-w-[220px] truncate font-medium" title={p.name}>
                                  {p.name}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCo2e(p.co2eTotal)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Go deeper</CardTitle>
                    <CardDescription>Same data pipeline as PDF/XLSX reports—adjust inputs in place.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${projectId}/versions/${versionId}/products`}>
                        <ListTree className="mr-2 h-4 w-4" />
                        Products
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${projectId}/versions/${versionId}/calculation`}>
                        <Calculator className="mr-2 h-4 w-4" />
                        Module allocation
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${projectId}/versions/${versionId}/validation`}>
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Validation
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${projectId}/versions/${versionId}/reports`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Reports & export
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </EmptyState>
        </AsyncView>
      </div>
    </AppLayout>
  );
}
