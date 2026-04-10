import React, { useDeferredValue, useEffect, useState } from "react";
import {
  useGetProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useDuplicateProduct,
  useGetEmissionFactors,
  getGetProductsQueryKey,
  getGetBuildingQueryKey,
  useGetVersion,
  previewProductImport,
  useCommitProductImport,
  type ProductImportPreviewResponse,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Database, Search, Loader2, FileSpreadsheet, Box } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { blockedEditToast, parseApiErrorJson } from "@/lib/apiErrorBody";
import { PRODUCT_CATEGORIES, QUANTITY_UNITS, QUANTITY_UNIT_LABELS } from "@/lib/productFields";
import { formatCo2e } from "@/lib/format";
import { AsyncView } from "@/components/feedback/AsyncView";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { BimImportDialog } from "@/components/bim/BimImportDialog";

type RowFieldErrors = Record<string, string>;

type ProductRow = {
  id: string;
  name: string;
  category: string;
  quantityValue: number | null;
  quantityUnit: string | null;
  moduleA1A3Share: number;
  moduleA4Share: number;
  moduleA5Share: number;
  moduleBShare: number;
  moduleCShare: number;
  emissionFactorId: string | null;
  emissionSourceType: string | null;
  emissionSourceName: string | null;
  emissionUnitSnapshot: string | null;
  co2ePerUnitSnapshot: number | null;
  emissionExternalSourceKey?: string | null;
  emissionExternalRecordId?: string | null;
  co2eTotal: number;
  updatedAt: string;
};

function fieldClass(err?: string) {
  return cn(err && "border-destructive focus-visible:ring-destructive");
}

function EditableRow({
  product,
  isLocked,
  isTenantEditor,
  fieldErrors,
  onUpdate,
  onDelete,
  onDuplicate,
  onAttachEF,
  onClearFieldError,
}: {
  product: ProductRow;
  isLocked: boolean;
  isTenantEditor: boolean;
  fieldErrors: RowFieldErrors;
  onUpdate: (productId: string, data: Record<string, unknown>) => Promise<boolean>;
  onDelete: (productId: string) => void;
  onDuplicate: (productId: string) => void;
  onAttachEF: (product: ProductRow) => void;
  onClearFieldError: (productId: string, field: string) => void;
}) {
  const readOnly = isLocked || !isTenantEditor;
  const [name, setName] = useState(product.name);
  const [qty, setQty] = useState(product.quantityValue?.toString() ?? "");
  const [unit, setUnit] = useState(product.quantityUnit || "kg");
  const [cat, setCat] = useState(product.category);
  const [a1, setA1] = useState(String(product.moduleA1A3Share));
  const [a4, setA4] = useState(String(product.moduleA4Share));
  const [a5, setA5] = useState(String(product.moduleA5Share));
  const [b, setB] = useState(String(product.moduleBShare));
  const [c, setC] = useState(String(product.moduleCShare));

  const handleBlur = async (field: string, value: unknown) => {
    if (readOnly) return;
    const prev = (product as Record<string, unknown>)[field];
    if (prev !== value && !(prev == null && value === "")) {
      onClearFieldError(product.id, field);
      await onUpdate(product.id, { [field]: value === "" ? null : value });
    }
  };

  const parseNum = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <>
      <TableRow className="align-top">
        <TableCell>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void handleBlur("name", name.trim())}
            disabled={readOnly}
            className={cn("h-8 min-w-[150px]", fieldClass(fieldErrors.name))}
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name ? <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p> : null}
        </TableCell>
        <TableCell>
          <Select
            disabled={readOnly}
            value={cat}
            onValueChange={(val) => {
              setCat(val);
              void handleBlur("category", val);
            }}
          >
            <SelectTrigger className={cn("h-8 w-[130px]", fieldClass(fieldErrors.category))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map((x) => (
                <SelectItem key={x} value={x} className="capitalize">
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.category ? <p className="text-xs text-destructive mt-1">{fieldErrors.category}</p> : null}
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => {
              const n = parseNum(qty);
              void handleBlur("quantityValue", n);
            }}
            disabled={readOnly}
            className={cn("h-8 w-[100px]", fieldClass(fieldErrors.quantityValue))}
            aria-invalid={!!fieldErrors.quantityValue}
          />
          {fieldErrors.quantityValue ? (
            <p className="text-xs text-destructive mt-1">{fieldErrors.quantityValue}</p>
          ) : null}
        </TableCell>
        <TableCell>
          <Select
            disabled={readOnly}
            value={unit}
            onValueChange={(val) => {
              setUnit(val);
              void handleBlur("quantityUnit", val);
            }}
          >
            <SelectTrigger className={cn("h-8 w-[88px]", fieldClass(fieldErrors.quantityUnit))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUANTITY_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {QUANTITY_UNIT_LABELS[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.quantityUnit ? (
            <p className="text-xs text-destructive mt-1">{fieldErrors.quantityUnit}</p>
          ) : null}
        </TableCell>
        <TableCell>
          {product.emissionFactorId ? (
            <div className="flex flex-col gap-1 text-xs max-w-[240px]">
              <span className="font-medium truncate" title={product.emissionSourceName ?? undefined}>
                {product.emissionSourceName}
              </span>
              <div className="flex flex-wrap gap-1 items-center">
                {product.emissionExternalSourceKey ? (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                    External
                  </Badge>
                ) : null}
                <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                  {product.emissionSourceType}
                </Badge>
                <span className="text-muted-foreground">
                  {product.co2ePerUnitSnapshot} kgCO₂e/{product.emissionUnitSnapshot}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Snapshot values are stored on the row for audit and deterministic CO₂e.
              </p>
              {!readOnly && (
                <div className="flex flex-wrap gap-x-2 gap-y-0">
                  <Button variant="link" className="h-5 p-0 text-xs text-primary" type="button" onClick={() => onAttachEF(product)}>
                    Change factor
                  </Button>
                  <Button
                    variant="link"
                    className="h-5 p-0 text-xs text-muted-foreground"
                    type="button"
                    onClick={() => void onUpdate(product.id, { emissionFactorId: null })}
                  >
                    Remove factor
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-dashed w-fit"
                onClick={() => onAttachEF(product)}
                disabled={readOnly}
                type="button"
              >
                <Database className="mr-1 h-3 w-3" /> Attach factor
              </Button>
              {fieldErrors.emissionFactorId ? (
                <p className="text-xs text-destructive max-w-[200px]">{fieldErrors.emissionFactorId}</p>
              ) : null}
            </div>
          )}
          {product.emissionFactorId && fieldErrors.emissionFactorId ? (
            <p className="text-xs text-destructive mt-1 max-w-[220px]">{fieldErrors.emissionFactorId}</p>
          ) : null}
        </TableCell>
        <TableCell className="text-right font-medium">{formatCo2e(product.co2eTotal)}</TableCell>
        <TableCell className="text-right">
          {!readOnly && (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => onDuplicate(product.id)}
                type="button"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onDelete(product.id)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      <TableRow className="bg-muted/30 border-b">
        <TableCell colSpan={7} className="py-2">
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground font-medium">Module life-cycle shares (must sum to 1.0)</span>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">A1–A3</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  className={cn("h-7 w-20", fieldClass(fieldErrors.moduleA1A3Share))}
                  value={a1}
                  onChange={(e) => setA1(e.target.value)}
                  onBlur={() => void handleBlur("moduleA1A3Share", parseNum(a1))}
                  disabled={readOnly}
                />
                {fieldErrors.moduleA1A3Share ? (
                  <span className="text-[10px] text-destructive max-w-[5.5rem] leading-tight">{fieldErrors.moduleA1A3Share}</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">A4</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  className={cn("h-7 w-20", fieldClass(fieldErrors.moduleA4Share))}
                  value={a4}
                  onChange={(e) => setA4(e.target.value)}
                  onBlur={() => void handleBlur("moduleA4Share", parseNum(a4))}
                  disabled={readOnly}
                />
                {fieldErrors.moduleA4Share ? (
                  <span className="text-[10px] text-destructive max-w-[5.5rem] leading-tight">{fieldErrors.moduleA4Share}</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">A5</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  className={cn("h-7 w-20", fieldClass(fieldErrors.moduleA5Share))}
                  value={a5}
                  onChange={(e) => setA5(e.target.value)}
                  onBlur={() => void handleBlur("moduleA5Share", parseNum(a5))}
                  disabled={readOnly}
                />
                {fieldErrors.moduleA5Share ? (
                  <span className="text-[10px] text-destructive max-w-[5.5rem] leading-tight">{fieldErrors.moduleA5Share}</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">B</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  className={cn("h-7 w-20", fieldClass(fieldErrors.moduleBShare))}
                  value={b}
                  onChange={(e) => setB(e.target.value)}
                  onBlur={() => void handleBlur("moduleBShare", parseNum(b))}
                  disabled={readOnly}
                />
                {fieldErrors.moduleBShare ? (
                  <span className="text-[10px] text-destructive max-w-[5.5rem] leading-tight">{fieldErrors.moduleBShare}</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">C</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  className={cn("h-7 w-20", fieldClass(fieldErrors.moduleCShare))}
                  value={c}
                  onChange={(e) => setC(e.target.value)}
                  onBlur={() => void handleBlur("moduleCShare", parseNum(c))}
                  disabled={readOnly}
                />
                {fieldErrors.moduleCShare ? (
                  <span className="text-[10px] text-destructive max-w-[5.5rem] leading-tight">{fieldErrors.moduleCShare}</span>
                ) : null}
              </label>
            </div>
            {fieldErrors.moduleShares ? <p className="text-destructive">{fieldErrors.moduleShares}</p> : null}
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function ProjectProducts({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isTenantEditor } = useAuth();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const {
    data: products = [],
    isLoading: productsLoading,
    isFetching: productsFetching,
    error: productsError,
  } = useGetProducts(versionId, { query: { enabled: !!versionId } });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();

  const isLocked = version?.status === "locked";
  const readOnly = isLocked || !isTenantEditor;

  const [rowErrors, setRowErrors] = useState<Record<string, RowFieldErrors>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const clearFieldError = (productId: string, field: string) => {
    setRowErrors((prev) => {
      const row = prev[productId];
      if (!row?.[field]) return prev;
      const next = { ...row };
      delete next[field];
      if (Object.keys(next).length === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleCreate = async () => {
    try {
      await createProduct.mutateAsync({
        versionId,
        data: {
          name: "New product",
          category: "other",
          quantityValue: 0,
          quantityUnit: "kg",
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e: unknown) {
      const j = parseApiErrorJson(e);
      if (j?.fieldErrors && Object.keys(j.fieldErrors).length > 0) {
        toast({
          variant: "destructive",
          title: "Could not add row",
          description: Object.values(j.fieldErrors).join(" · "),
        });
        return;
      }
      const { title, description } = blockedEditToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const handleUpdate = async (productId: string, data: Record<string, unknown>): Promise<boolean> => {
    try {
      await updateProduct.mutateAsync({ id: productId, data });
      setRowErrors((prev) => {
        if (!prev[productId]) return prev;
        const { [productId]: _, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
      return true;
    } catch (e: unknown) {
      const j = parseApiErrorJson(e);
      if (j?.code === "PRODUCT_VALIDATION_FAILED" && j.fieldErrors && Object.keys(j.fieldErrors).length > 0) {
        setRowErrors((prev) => ({ ...prev, [productId]: j.fieldErrors! }));
        return false;
      }
      if (j?.code === "EMISSION_FACTOR_INVALID" && j.fieldErrors && Object.keys(j.fieldErrors).length > 0) {
        setRowErrors((prev) => ({ ...prev, [productId]: j.fieldErrors! }));
        return false;
      }
      const { title, description } = blockedEditToast(e);
      toast({ variant: "destructive", title, description });
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteProduct.mutateAsync({ id: deleteId });
      setRowErrors((prev) => {
        const { [deleteId]: _, ...rest } = prev;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
      setDeleteId(null);
    } catch (e: unknown) {
      const { title, description } = blockedEditToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const handleDuplicate = async (productId: string) => {
    try {
      await duplicateProduct.mutateAsync({ id: productId });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e: unknown) {
      const { title, description } = blockedEditToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const [importOpen, setImportOpen] = useState(false);
  const [bimImportOpen, setBimImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ProductImportPreviewResponse | null>(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const commitImport = useCommitProductImport();

  const [efModalOpen, setEfModalOpen] = useState(false);
  const [selectedProductForEF, setSelectedProductForEF] = useState<ProductRow | null>(null);
  const [efSearch, setEfSearch] = useState("");
  const [efSourceType, setEfSourceType] = useState<string | undefined>(undefined);
  const efQuery = useDeferredValue(efSearch);

  const { data: efs, isLoading: efLoading } = useGetEmissionFactors(
    {
      unit: selectedProductForEF?.quantityUnit || undefined,
      q: efQuery.trim() || undefined,
      sourceType: efSourceType,
    },
    { query: { enabled: efModalOpen && !!selectedProductForEF } },
  );

  useEffect(() => {
    if (efModalOpen) {
      setEfSearch("");
      setEfSourceType(undefined);
    }
  }, [efModalOpen, selectedProductForEF?.id]);

  const openEfModal = (product: ProductRow) => {
    setSelectedProductForEF(product);
    setEfModalOpen(true);
  };

  const resetImportDialog = () => {
    setImportPreview(null);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportPreviewLoading(true);
    setImportPreview(null);
    try {
      const p = await previewProductImport(versionId, file);
      setImportPreview(p);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not read file",
        description: errMessage(e),
      });
    } finally {
      setImportPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.structureOk) return;
    const rows = importPreview.rows.filter((r) => r.ok && r.data).map((r) => r.data!);
    if (rows.length === 0) return;
    try {
      await commitImport.mutateAsync({
        versionId,
        data: { rows },
      });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
      toast({
        title: "Import complete",
        description: `${rows.length} product row(s) added.`,
      });
      setImportOpen(false);
      resetImportDialog();
    } catch (e: unknown) {
      const j = parseApiErrorJson(e);
      toast({
        variant: "destructive",
        title: "Import failed",
        description: j?.error ?? errMessage(e),
      });
    }
  };

  const selectEf = async (efId: string) => {
    if (!selectedProductForEF) return;
    const ok = await handleUpdate(selectedProductForEF.id, { emissionFactorId: efId });
    if (ok) {
      setEfModalOpen(false);
      setSelectedProductForEF(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Product data</h1>
            <p className="text-muted-foreground mt-1">
              Add and edit material rows for this version. Quantities, units, module shares, and emission factors feed CO₂e calculations.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isLocked ? <Badge variant="default">Version locked</Badge> : null}
            {!isTenantEditor ? <Badge variant="secondary">View only</Badge> : null}
          </div>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        {!isTenantEditor ? (
          <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You do not have edit access. Only tenant editors and admins can change product rows.
          </div>
        ) : null}

        <AsyncView loading={productsLoading} error={productsError} loadingMessage="Loading products…">
          <div
            className={cn(
              "bg-card border rounded-lg shadow-sm flex flex-col transition-opacity",
              productsFetching && !productsLoading && "opacity-70",
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Emission factor</TableHead>
                  <TableHead className="text-right">CO₂e total</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No product rows yet. Add a row to start quantifying materials for this version.
                    </TableCell>
                  </TableRow>
                ) : (
                  (products as ProductRow[]).map((p) => (
                    <EditableRow
                      key={`${p.id}-${p.updatedAt}`}
                      product={p}
                      isLocked={isLocked}
                      isTenantEditor={isTenantEditor}
                      fieldErrors={rowErrors[p.id] ?? {}}
                      onUpdate={handleUpdate}
                      onDelete={(id) => setDeleteId(id)}
                      onDuplicate={handleDuplicate}
                      onAttachEF={openEfModal}
                      onClearFieldError={clearFieldError}
                    />
                  ))
                )}
              </TableBody>
            </Table>

            {isTenantEditor && !readOnly ? (
              <div className="p-4 border-t bg-muted/10 flex flex-col sm:flex-row flex-wrap gap-2">
                <Button variant="outline" className="flex-1 border-dashed" onClick={() => void handleCreate()} disabled={createProduct.isPending}>
                  <Plus className="mr-2 h-4 w-4" /> Add product row
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-dashed"
                  type="button"
                  onClick={() => {
                    setImportOpen(true);
                    resetImportDialog();
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Import from Excel
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-dashed"
                  type="button"
                  onClick={() => setBimImportOpen(true)}
                >
                  <Box className="mr-2 h-4 w-4" /> Import from IFC
                </Button>
              </div>
            ) : null}
          </div>
        </AsyncView>

        <BimImportDialog
          projectId={projectId}
          versionId={versionId}
          open={bimImportOpen}
          onOpenChange={setBimImportOpen}
          readOnly={readOnly}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
            void queryClient.invalidateQueries({ queryKey: getGetBuildingQueryKey(projectId, versionId) });
          }}
        />

        <Dialog
          open={importOpen}
          onOpenChange={(o) => {
            setImportOpen(o);
            if (!o) resetImportDialog();
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0">
            <DialogHeader>
              <DialogTitle>Import products from Excel</DialogTitle>
              <p className="text-sm text-muted-foreground text-left font-normal">
                Use a <strong>.xlsx</strong> file with a <strong>Products</strong> sheet (or the first sheet) and the
                same columns as a Finni export: Name, Category, Qty, Unit, A1-A3, A4, A5, B, C. Extra columns from
                exports (Product id, CO₂e/unit, Total) are ignored. Emission factors are not imported—attach them after
                import.
              </p>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <Input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importPreviewLoading || commitImport.isPending}
                onChange={(e) => void handleImportFile(e.target.files?.[0])}
              />
              {importPreviewLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Parsing and validating…
                </div>
              ) : null}
              {importPreview && !importPreview.structureOk ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {importPreview.structureError ?? "Invalid file structure"}
                </div>
              ) : null}
              {importPreview?.structureOk ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Worksheet &quot;{importPreview.worksheetName}&quot; — {importPreview.validCount} valid row(s),{" "}
                    {importPreview.errorCount} row(s) with errors.
                  </p>
                  <div className="border rounded-md overflow-auto max-h-[min(50vh,420px)]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Row</TableHead>
                          <TableHead className="w-20">Status</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Issues</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.rows.map((r) => (
                          <TableRow key={r.excelRow}>
                            <TableCell className="font-mono text-xs">{r.excelRow}</TableCell>
                            <TableCell>
                              {r.ok ? (
                                <Badge variant="secondary" className="text-xs">
                                  OK
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  Error
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate" title={r.data?.name}>
                              {r.data?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">
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
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  !importPreview?.structureOk ||
                  importPreview.validCount === 0 ||
                  commitImport.isPending ||
                  importPreviewLoading
                }
                onClick={() => void handleConfirmImport()}
              >
                {commitImport.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  `Import ${importPreview?.validCount ?? 0} row(s)`
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={efModalOpen} onOpenChange={setEfModalOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0">
            <DialogHeader>
              <DialogTitle>Emission factor catalog</DialogTitle>
              <p className="text-sm text-muted-foreground text-left font-normal">
                Choose a factor from the platform or tenant catalog. The list matches the product&apos;s quantity unit (
                {selectedProductForEF?.quantityUnit ? QUANTITY_UNIT_LABELS[selectedProductForEF.quantityUnit as keyof typeof QUANTITY_UNIT_LABELS] ?? selectedProductForEF.quantityUnit : "—"}
                ). Values are copied to the product row as a snapshot for reporting.
              </p>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row gap-2 py-3 border-b">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or category…"
                  value={efSearch}
                  onChange={(e) => setEfSearch(e.target.value)}
                />
              </div>
              <Select
                value={efSourceType ?? "_all"}
                onValueChange={(v) => setEfSourceType(v === "_all" ? undefined : v)}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Source type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All source types</SelectItem>
                  <SelectItem value="generic">generic</SelectItem>
                  <SelectItem value="product">product</SelectItem>
                  <SelectItem value="EPD">EPD</SelectItem>
                  <SelectItem value="external">external</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-auto min-h-[200px]">
              {efLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  Loading factors…
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">CO₂e / unit</TableHead>
                      <TableHead className="w-[90px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {efs?.map((ef) => (
                      <TableRow key={ef.id}>
                        <TableCell className="font-medium max-w-[240px]">
                          <span className="line-clamp-2" title={ef.sourceName}>
                            {ef.sourceName}
                          </span>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{ef.category}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {"externalSourceKey" in ef && ef.externalSourceKey ? (
                              <Badge variant="secondary" className="text-[10px]">
                                External
                              </Badge>
                            ) : null}
                            {ef.tenantId && ef.sourceType === "EPD" && !("externalSourceKey" in ef && ef.externalSourceKey) ? (
                              <Badge variant="outline" className="text-[10px] border-primary/40">
                                Tenant EPD
                              </Badge>
                            ) : null}
                            <Badge variant="outline">{ef.sourceType}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {ef.co2ePerUnit} / {ef.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" type="button" onClick={() => void selectEf(ef.id)}>
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {efs && efs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                          No factors match this unit and filters. Try another search or change the product quantity unit to match the
                          factor&apos;s unit.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this product row?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the row from the version. You can add a new row or duplicate another version if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" type="button" onClick={() => void confirmDelete()} disabled={deleteProduct.isPending}>
                {deleteProduct.isPending ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
