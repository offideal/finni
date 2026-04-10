import React from "react";
import {
  useGetTenantEmissionFactorsManaged,
  useCreateTenantEmissionFactor,
  useUpdateTenantEmissionFactor,
  useArchiveTenantEmissionFactor,
  getGetTenantEmissionFactorsManagedQueryKey,
  getGetEmissionFactorsQueryKey,
  type EmissionFactor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Pencil, Plus, Archive } from "lucide-react";
import { useLocation } from "wouter";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { AsyncView } from "@/components/feedback/AsyncView";
import { PRODUCT_CATEGORIES, QUANTITY_UNITS, QUANTITY_UNIT_LABELS } from "@/lib/productFields";
import { parseApiErrorJson } from "@/lib/apiErrorBody";

const EPD_CATEGORIES = [
  "concrete",
  "steel",
  "wood",
  "insulation",
  "glass",
  "gypsum",
  "HVAC",
  "electrical",
  "site",
  "other",
] as const;

const epdFormSchema = z.object({
  sourceName: z.string().min(1, "Name is required").max(500),
  category: z.enum(EPD_CATEGORIES),
  unit: z.enum(["kg", "m2", "m3"]),
  co2ePerUnit: z.coerce.number().min(0, "Must be ≥ 0").finite(),
});

type EpdForm = z.infer<typeof epdFormSchema>;

function errMessage(e: unknown): string {
  const j = parseApiErrorJson(e);
  if (j?.error && typeof j.error === "string") return j.error;
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export default function TenantEpdSettingsPage() {
  const { canManageTenantEpd } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows, isLoading, error } = useGetTenantEmissionFactorsManaged({
    query: { enabled: canManageTenantEpd },
  });
  const createMut = useCreateTenantEmissionFactor();
  const updateMut = useUpdateTenantEmissionFactor();
  const archiveMut = useArchiveTenantEmissionFactor();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmissionFactor | null>(null);
  const [archiving, setArchiving] = React.useState<EmissionFactor | null>(null);

  const form = useForm<EpdForm>({
    resolver: zodResolver(epdFormSchema),
    defaultValues: {
      sourceName: "",
      category: "other",
      unit: "kg",
      co2ePerUnit: 0,
    },
  });

  const editForm = useForm<EpdForm>({
    resolver: zodResolver(epdFormSchema),
  });

  React.useEffect(() => {
    if (canManageTenantEpd === false) {
      setLocation("/projects");
    }
  }, [canManageTenantEpd, setLocation]);

  React.useEffect(() => {
    if (!editing) return;
    editForm.reset({
      sourceName: editing.sourceName,
      category: editing.category as EpdForm["category"],
      unit: editing.unit as EpdForm["unit"],
      co2ePerUnit: editing.co2ePerUnit,
    });
  }, [editing, editForm]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetTenantEmissionFactorsManagedQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetEmissionFactorsQueryKey() });
  };

  const onCreate = async (data: EpdForm) => {
    try {
      await createMut.mutateAsync({
        sourceName: data.sourceName,
        category: data.category,
        unit: data.unit,
        co2ePerUnit: data.co2ePerUnit,
      });
      toast({ title: "EPD added", description: "It is now available when attaching factors to products." });
      setCreateOpen(false);
      form.reset({ sourceName: "", category: "other", unit: "kg", co2ePerUnit: 0 });
      invalidate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Could not create", description: errMessage(e) });
    }
  };

  const onUpdate = async (data: EpdForm) => {
    if (!editing) return;
    try {
      await updateMut.mutateAsync({
        id: editing.id,
        data: {
          sourceName: data.sourceName,
          category: data.category,
          unit: data.unit,
          co2ePerUnit: data.co2ePerUnit,
        },
      });
      toast({ title: "EPD updated" });
      setEditing(null);
      invalidate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Could not update", description: errMessage(e) });
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    try {
      await archiveMut.mutateAsync(archiving.id);
      toast({
        title: "Archived",
        description: "Existing product snapshots are unchanged; new rows cannot select this factor.",
      });
      setArchiving(null);
      invalidate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Could not archive", description: errMessage(e) });
    }
  };

  if (!canManageTenantEpd) {
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tenant EPDs</h1>
            <p className="text-muted-foreground mt-1">
              Add organization-specific emission factors (stored as EPD-type catalog rows). They are visible only to your
              tenant. Product rows keep a snapshot when you attach a factor—locked versions stay auditable.
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add EPD
          </Button>
        </div>

        <AsyncView loading={isLoading} error={error} loadingMessage="Loading tenant EPDs…">
          <div className="border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">CO₂e / unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No tenant EPDs yet. Add one to use it on product rows alongside the platform catalog.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[280px]">{r.sourceName}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{r.category}</TableCell>
                      <TableCell>{QUANTITY_UNIT_LABELS[r.unit as keyof typeof QUANTITY_UNIT_LABELS] ?? r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.co2ePerUnit}</TableCell>
                      <TableCell>
                        {r.active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="outline">Archived</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!r.active}
                          title="Edit"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!r.active}
                          title="Archive"
                          onClick={() => setArchiving(r)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </AsyncView>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add tenant EPD</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="sourceName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Supplier X — product Y (EPD ref)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PRODUCT_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Declared unit</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {QUANTITY_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {QUANTITY_UNIT_LABELS[u]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="co2ePerUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CO₂e per unit</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMut.isPending}>
                    {createMut.isPending ? "Saving…" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit tenant EPD</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="sourceName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PRODUCT_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {QUANTITY_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {QUANTITY_UNIT_LABELS[u]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="co2ePerUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CO₂e per unit</FormLabel>
                      <FormControl>
                        <Input type="number" step="any" min={0} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMut.isPending}>
                    {updateMut.isPending ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this EPD?</AlertDialogTitle>
              <AlertDialogDescription>
                It will disappear from the factor picker for new attachments. Existing product snapshots are not changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button type="button" variant="destructive" onClick={() => void confirmArchive()} disabled={archiveMut.isPending}>
                {archiveMut.isPending ? "Archiving…" : "Archive"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
