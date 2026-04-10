import React, { useEffect, useState } from "react";
import {
  previewBimImport,
  useCommitBimImport,
  type BimImportPreviewResponse,
  type ProductImportRow,
} from "@workspace/api-client-react";
import { Loader2, Box } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { parseApiErrorJson } from "@/lib/apiErrorBody";

function errMessage(e: unknown): string {
  const j = parseApiErrorJson(e);
  if (j?.error && typeof j.error === "string") return j.error;
  if (e instanceof Error) return e.message;
  return "Request failed";
}

type Props = {
  projectId: string;
  versionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onSuccess: () => void;
};

function productRowsToCommit(preview: BimImportPreviewResponse): ProductImportRow[] {
  const out: ProductImportRow[] = [];
  for (const r of preview.productRows) {
    if (!r.ok || !r.data) continue;
    out.push(r.data);
  }
  return out;
}

export function BimImportDialog({ projectId: _projectId, versionId, open, onOpenChange, readOnly, onSuccess }: Props) {
  void _projectId;
  const { toast } = useToast();
  const [preview, setPreview] = useState<BimImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [grossInput, setGrossInput] = useState("");
  const [applyBuilding, setApplyBuilding] = useState(true);
  const commit = useCommitBimImport();

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setGrossInput("");
      setApplyBuilding(true);
    }
  }, [open]);

  useEffect(() => {
    if (preview?.structureOk && preview.suggestedGrossAreaM2 != null) {
      setGrossInput(String(Math.round(preview.suggestedGrossAreaM2 * 1000) / 1000));
    }
  }, [preview]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setPreview(null);
    try {
      const p = await previewBimImport(versionId, file);
      setPreview(p);
      if (p.structureOk && p.suggestedGrossAreaM2 != null) {
        setGrossInput(String(Math.round(p.suggestedGrossAreaM2 * 1000) / 1000));
      } else if (p.structureOk) {
        setGrossInput("");
      }
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not read IFC",
        description: errMessage(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.structureOk) return;
    const products = productRowsToCommit(preview);
    let grossAreaM2: number | null = null;
    if (applyBuilding) {
      const g = grossInput.trim() === "" ? NaN : Number(grossInput);
      grossAreaM2 = g;
      if (!Number.isFinite(grossAreaM2) || grossAreaM2 < 0) {
        toast({
          variant: "destructive",
          title: "Gross area required",
          description: "Enter a valid gross floor area (m²) before applying building data.",
        });
        return;
      }
    }

    const spaces =
      applyBuilding && preview.spaces
        ? preview.spaces
            .filter((s) => s.areaM2 != null && Number.isFinite(s.areaM2))
            .map((s) => ({ name: s.name, areaM2: s.areaM2 as number }))
        : [];

    if (products.length === 0 && !applyBuilding) {
      toast({
        variant: "destructive",
        title: "Nothing to import",
        description: "Enable building import or include at least one valid product row.",
      });
      return;
    }

    try {
      await commit.mutateAsync({
        versionId,
        data: {
          applyBuilding,
          ...(applyBuilding && grossAreaM2 != null
            ? {
                building: {
                  grossAreaM2,
                  spaces,
                },
              }
            : {}),
          products,
        },
      });
      toast({
        title: "IFC import complete",
        description: [
          applyBuilding ? "Building snapshot updated." : null,
          products.length > 0 ? `${products.length} product row(s) added.` : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      onOpenChange(false);
      onSuccess();
    } catch (e: unknown) {
      const j = parseApiErrorJson(e);
      toast({
        variant: "destructive",
        title: "Import failed",
        description: j?.error ?? errMessage(e),
      });
    }
  };

  const okProducts = preview?.productRows.filter((r) => r.ok).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            Import from IFC (BIM)
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-left font-normal">
            Upload an <strong>.ifc</strong> (ISO-10303-21) file. Only a narrow, explicit scope is supported: building
            name and space areas where parsable, plus selected element types as product rows. Review the preview, then
            confirm. Emission factors are not imported. Draft versions only.
          </p>
        </DialogHeader>
        <div className="py-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <Input
            type="file"
            accept=".ifc,application/octet-stream"
            disabled={readOnly || loading || commit.isPending}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing IFC…
            </div>
          ) : null}

          {preview && !preview.structureOk ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {preview.structureError ?? "Invalid IFC file"}
            </div>
          ) : null}

          {preview?.structureOk ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
                <p className="font-medium">Supported scope</p>
                <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                  {preview.scopeNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                {preview.schemaName ? (
                  <p className="text-xs text-muted-foreground pt-1">Schema: {preview.schemaName}</p>
                ) : null}
              </div>

              {preview.warnings.length > 0 ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-amber-900 dark:text-amber-100">
                  {preview.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2 border rounded-md p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bim-apply-building"
                    checked={applyBuilding}
                    onCheckedChange={(c) => setApplyBuilding(c === true)}
                    disabled={readOnly || commit.isPending}
                  />
                  <Label htmlFor="bim-apply-building" className="cursor-pointer">
                    Apply building snapshot (gross area + spaces with parsed areas)
                  </Label>
                </div>
                {preview.buildingName ? (
                  <p className="text-muted-foreground">
                    Building name (from IFC): <span className="text-foreground font-medium">{preview.buildingName}</span>
                  </p>
                ) : null}
                {applyBuilding ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                    <div className="flex-1 space-y-1 w-full">
                      <Label htmlFor="bim-gross">Gross floor area (m²)</Label>
                      <Input
                        id="bim-gross"
                        value={grossInput}
                        onChange={(e) => setGrossInput(e.target.value)}
                        disabled={readOnly || commit.isPending}
                        placeholder="e.g. 1250"
                      />
                    </div>
                  </div>
                ) : null}
                {preview.spaces.length > 0 ? (
                  <div className="overflow-auto max-h-40 border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Space</TableHead>
                          <TableHead className="text-right">Area (m²)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.spaces.map((s) => (
                          <TableRow key={s.sourceExpressId}>
                            <TableCell className="max-w-[240px] truncate" title={s.name}>
                              {s.name}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {s.areaM2 != null ? s.areaM2.toFixed(3) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No IfcSpace rows detected.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Product candidates: {preview.stats.productOk} valid, {preview.stats.productError} skipped — importing{" "}
                  <strong>{okProducts}</strong> row(s).
                </p>
                <div className="border rounded-md overflow-auto max-h-[min(40vh,320px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">IFC</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.productRows.map((r) => (
                        <TableRow key={`${r.sourceExpressId}-${r.ifcType}`}>
                          <TableCell className="font-mono text-[10px] text-muted-foreground">{r.ifcType}</TableCell>
                          <TableCell>
                            {r.ok ? (
                              <Badge variant="secondary" className="text-xs">
                                OK
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                Skip
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={r.data?.name}>
                            {r.data?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.ok
                              ? "—"
                              : r.fieldErrors
                                ? Object.entries(r.fieldErrors)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" · ")
                                : "Invalid"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={commit.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={
              readOnly ||
              !preview?.structureOk ||
              commit.isPending ||
              (preview != null &&
                productRowsToCommit(preview).length === 0 &&
                !applyBuilding)
            }
          >
            {commit.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
              </>
            ) : (
              "Confirm import"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
