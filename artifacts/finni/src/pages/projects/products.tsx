import React, { useState } from "react";
import {
  useGetProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useDuplicateProduct,
  useGetEmissionFactors,
  getGetProductsQueryKey,
  useGetVersion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, Search, Database } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// We'll manage inline edits with a simple local state that syncs on blur to avoid complex forms
function EditableRow({ 
  product, 
  isLocked, 
  onUpdate, 
  onDelete, 
  onDuplicate,
  onAttachEF
}: any) {
  const [name, setName] = useState(product.name);
  const [qty, setQty] = useState(product.quantityValue?.toString() || "");
  const [unit, setUnit] = useState(product.quantityUnit || "kg");
  const [cat, setCat] = useState(product.category);

  const handleBlur = (field: string, value: any) => {
    if (product[field] !== value && !(product[field] == null && value === "")) {
      onUpdate(product.id, { [field]: value === "" ? null : value });
    }
  };

  return (
    <TableRow>
      <TableCell>
        <Input 
          value={name} 
          onChange={e => setName(e.target.value)}
          onBlur={() => handleBlur("name", name)}
          disabled={isLocked}
          className="h-8 min-w-[150px]"
        />
      </TableCell>
      <TableCell>
        <Select 
          disabled={isLocked} 
          value={cat} 
          onValueChange={(val) => { setCat(val); handleBlur("category", val); }}
        >
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["concrete", "steel", "wood", "insulation", "glass", "gypsum", "HVAC", "electrical", "site", "other"].map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input 
          type="number"
          value={qty} 
          onChange={e => setQty(e.target.value)}
          onBlur={() => handleBlur("quantityValue", Number(qty))}
          disabled={isLocked}
          className="h-8 w-[100px]"
        />
      </TableCell>
      <TableCell>
        <Select 
          disabled={isLocked} 
          value={unit} 
          onValueChange={(val) => { setUnit(val); handleBlur("quantityUnit", val); }}
        >
          <SelectTrigger className="h-8 w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kg">kg</SelectItem>
            <SelectItem value="m2">m²</SelectItem>
            <SelectItem value="m3">m³</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {product.emissionFactorId ? (
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-medium truncate max-w-[200px]" title={product.emissionSourceName}>
              {product.emissionSourceName}
            </span>
            <div className="flex gap-1 items-center">
              <Badge variant="outline" className="text-[10px] h-4 px-1">{product.emissionSourceType}</Badge>
              <span className="text-muted-foreground">{product.co2ePerUnitSnapshot} kgCO2e/{product.emissionUnitSnapshot}</span>
            </div>
            {!isLocked && (
              <Button variant="link" className="h-5 p-0 text-xs text-primary self-start" onClick={() => onAttachEF(product)}>
                Change Factor
              </Button>
            )}
          </div>
        ) : (
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs border-dashed"
            onClick={() => onAttachEF(product)}
            disabled={isLocked}
          >
            <Database className="mr-1 h-3 w-3" /> Attach Factor
          </Button>
        )}
      </TableCell>
      <TableCell className="text-right font-medium">
        {product.co2eTotal != null ? product.co2eTotal.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}
      </TableCell>
      <TableCell className="text-right">
        {!isLocked && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onDuplicate(product.id)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(product.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ProjectProducts({ params }: { params: { id: string; versionId: string } }) {
  const { id: projectId, versionId } = params;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });
  const { data: products = [] } = useGetProducts(versionId, { query: { enabled: !!versionId } });
  
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();

  const isLocked = version?.status === "locked";

  const handleCreate = async () => {
    try {
      await createProduct.mutateAsync({
        versionId,
        data: {
          name: "New Product",
          category: "concrete",
          quantityValue: 0,
          quantityUnit: "kg"
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to add row" });
    }
  };

  const handleUpdate = async (productId: string, data: any) => {
    try {
      await updateProduct.mutateAsync({ id: productId, data });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e) {
      toast({ variant: "destructive", title: "Update failed" });
    }
  };

  const handleDelete = async (productId: string) => {
    try {
      await deleteProduct.mutateAsync({ id: productId } as any);
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  };

  const handleDuplicate = async (productId: string) => {
    try {
      await duplicateProduct.mutateAsync({ id: productId });
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
    } catch (e) {
      toast({ variant: "destructive", title: "Duplicate failed" });
    }
  };

  // Emission Factor Modal State
  const [efModalOpen, setEfModalOpen] = useState(false);
  const [selectedProductForEF, setSelectedProductForEF] = useState<any>(null);
  
  // Only fetch EFs if modal is open and we have a product to filter by unit
  const { data: efs } = useGetEmissionFactors(
    { unit: selectedProductForEF?.quantityUnit || undefined },
    { query: { enabled: efModalOpen && !!selectedProductForEF } }
  );

  const openEfModal = (product: any) => {
    setSelectedProductForEF(product);
    setEfModalOpen(true);
  };

  const selectEf = async (efId: string) => {
    if (selectedProductForEF) {
      await handleUpdate(selectedProductForEF.id, { emissionFactorId: efId });
      setEfModalOpen(false);
      setSelectedProductForEF(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Products Inventory</h1>
            <p className="text-muted-foreground mt-1">
              List and quantify building materials to calculate emissions.
            </p>
          </div>
          {isLocked && <Badge variant="default" className="text-sm h-7">Version Locked</Badge>}
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        <div className="bg-card border rounded-lg shadow-sm flex flex-col">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Emission Factor</TableHead>
                <TableHead className="text-right">CO2e Total</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No products added yet. Click below to add your first material.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p: any) => (
                  <EditableRow 
                    key={p.id} 
                    product={p} 
                    isLocked={isLocked}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onAttachEF={openEfModal}
                  />
                ))
              )}
            </TableBody>
          </Table>
          
          {!isLocked && (
            <div className="p-4 border-t bg-muted/10">
              <Button variant="outline" className="w-full border-dashed" onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" /> Add Product Row
              </Button>
            </div>
          )}
        </div>

        <Dialog open={efModalOpen} onOpenChange={setEfModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Select Emission Factor</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">CO2e per Unit</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {efs?.map((ef) => (
                    <TableRow key={ef.id}>
                      <TableCell className="font-medium max-w-[250px] truncate" title={ef.sourceName}>
                        {ef.sourceName}
                      </TableCell>
                      <TableCell className="capitalize">{ef.category}</TableCell>
                      <TableCell><Badge variant="outline">{ef.sourceType}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{ef.co2ePerUnit} /{ef.unit}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => selectEf(ef.id)}>Select</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {efs?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No compatible emission factors found for unit '{selectedProductForEF?.quantityUnit}'.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
