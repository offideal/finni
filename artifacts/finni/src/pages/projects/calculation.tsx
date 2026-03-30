import React from "react";
import {
  useGetCalculations,
  useGetProducts,
  useUpdateProduct,
  useGetVersion,
  getGetCalculationsQueryKey,
  getGetProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Zap } from "lucide-react";

export default function ProjectCalculation({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const queryClient = useQueryClient();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const { data: calc } = useGetCalculations(versionId, { query: { enabled: !!versionId } });
  const { data: products = [] } = useGetProducts(versionId, { query: { enabled: !!versionId } });
  
  const updateProduct = useUpdateProduct();
  const isLocked = version?.status === "locked";

  const handleUpdateShare = async (productId: string, field: string, value: string) => {
    const num = Number(value);
    if (!isNaN(num)) {
      try {
        await updateProduct.mutateAsync({ id: productId, data: { [field]: num } });
        // Instead of invalidate, we could patch cache, but invalidate is safer for calculations if backend recalculates
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
        queryClient.invalidateQueries({ queryKey: getGetCalculationsQueryKey(versionId) });
      } catch (e) {
        // error
      }
    }
  };

  const handleFillPreset = async () => {
    for (const p of products) {
      await updateProduct.mutateAsync({
        id: p.id,
        data: {
          moduleA1A3Share: 1.0,
          moduleA4Share: 0.0,
          moduleA5Share: 0.0,
          moduleBShare: 0.0,
          moduleCShare: 0.0,
        }
      });
    }
    queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    queryClient.invalidateQueries({ queryKey: getGetCalculationsQueryKey(versionId) });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculation & Module Breakdown</h1>
          <p className="text-muted-foreground mt-1">
            Distribute lifecycle modules across lifecycle phases (A1-A3, A4, A5, B, C).
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <div className="bg-primary/5 border border-primary/20 p-4 rounded-md">
          <div className="font-mono text-sm">Formula: CO2eTotal = Quantity × EmissionFactor × ModuleShare</div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium">Product Allocations</h2>
          {!isLocked && (
            <Button variant="outline" size="sm" onClick={handleFillPreset}>
              <Zap className="mr-2 h-4 w-4" />
              Fill Preset (A1-A3 = 100%)
            </Button>
          )}
        </div>

        <div className="bg-card border rounded-lg shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Product</TableHead>
                <TableHead className="w-[100px]">A1-A3</TableHead>
                <TableHead className="w-[100px]">A4</TableHead>
                <TableHead className="w-[100px]">A5</TableHead>
                <TableHead className="w-[100px]">B</TableHead>
                <TableHead className="w-[100px]">C</TableHead>
                <TableHead className="text-right w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p: any) => {
                const sum = p.moduleA1A3Share + p.moduleA4Share + p.moduleA5Share + p.moduleBShare + p.moduleCShare;
                const isError = Math.abs(sum - 1.0) > 0.001;

                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium truncate max-w-[200px]">{p.name}</TableCell>
                    <TableCell>
                      <Input 
                        type="number" step="0.1" 
                        defaultValue={p.moduleA1A3Share} 
                        disabled={isLocked}
                        onBlur={(e) => handleUpdateShare(p.id, "moduleA1A3Share", e.target.value)}
                        className="h-8 px-2"
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" step="0.1" 
                        defaultValue={p.moduleA4Share} 
                        disabled={isLocked}
                        onBlur={(e) => handleUpdateShare(p.id, "moduleA4Share", e.target.value)}
                        className="h-8 px-2"
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" step="0.1" 
                        defaultValue={p.moduleA5Share} 
                        disabled={isLocked}
                        onBlur={(e) => handleUpdateShare(p.id, "moduleA5Share", e.target.value)}
                        className="h-8 px-2"
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" step="0.1" 
                        defaultValue={p.moduleBShare} 
                        disabled={isLocked}
                        onBlur={(e) => handleUpdateShare(p.id, "moduleBShare", e.target.value)}
                        className="h-8 px-2"
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" step="0.1" 
                        defaultValue={p.moduleCShare} 
                        disabled={isLocked}
                        onBlur={(e) => handleUpdateShare(p.id, "moduleCShare", e.target.value)}
                        className="h-8 px-2"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {isError ? (
                        <div className="flex justify-end"><AlertCircle className="h-5 w-5 text-destructive" /></div>
                      ) : (
                        <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {calc && (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-4">Module Totals</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {calc.modules.map((m: any) => (
                <div key={m.module} className="bg-muted/30 p-4 rounded-lg border">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Module {m.module}</div>
                  <div className="text-xl font-bold">{m.co2eTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                </div>
              ))}
              <div className="bg-primary p-4 rounded-lg text-primary-foreground shadow-sm">
                <div className="text-sm font-medium opacity-80 mb-1">Grand Total</div>
                <div className="text-xl font-bold">{calc.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
