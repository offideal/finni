import React, { useEffect, useState } from "react";
import {
  useGetBuilding,
  useUpsertBuilding,
  useGetVersion,
  getGetBuildingQueryKey,
  getGetProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Save, Lock, Box } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { blockedEditToast } from "@/lib/apiErrorBody";
import { useAuth } from "@/lib/auth";
import { AsyncView } from "@/components/feedback/AsyncView";
import { BimImportDialog } from "@/components/bim/BimImportDialog";

const buildingSchema = z
  .object({
    grossAreaM2: z.coerce
      .number({ invalid_type_error: "Gross area is required" })
      .min(0, "Gross area cannot be negative"),
    spaces: z.array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1, "Space name is required"),
        areaM2: z.coerce.number().min(0, "Area cannot be negative"),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const sum = data.spaces.reduce((acc, s) => acc + (Number.isFinite(s.areaM2) ? s.areaM2 : 0), 0);
    if (sum > data.grossAreaM2 + 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sum of space areas cannot exceed gross area",
        path: ["spaces"],
      });
    }
  });

export default function ProjectBuilding({
  params,
}: {
  params: { id: string; versionId: string };
}) {
  const projectId = params.id;
  const versionId = params.versionId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isTenantEditor } = useAuth();

  const {
    data: building,
    isLoading: buildingLoading,
    error: buildingError,
  } = useGetBuilding(projectId, versionId, { query: { enabled: !!projectId && !!versionId } });

  const { data: version } = useGetVersion(versionId, { query: { enabled: !!versionId } });

  const upsertBuilding = useUpsertBuilding();

  const form = useForm<z.infer<typeof buildingSchema>>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      grossAreaM2: 0,
      spaces: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "spaces",
  });

  const initKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!building || !versionId) return;
    const key = `${building.id}-${building.updatedAt}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    form.reset({
      grossAreaM2: building.grossAreaM2 ?? 0,
      spaces: building.spaces.map((s) => ({ id: s.id, name: s.name, areaM2: s.areaM2 })),
    });
  }, [building, form, versionId]);

  const isLocked = version?.status === "locked";
  const readOnly = isLocked || !isTenantEditor;
  const [bimImportOpen, setBimImportOpen] = useState(false);

  const onSubmit = async (data: z.infer<typeof buildingSchema>) => {
    if (readOnly) return;
    try {
      await upsertBuilding.mutateAsync({
        projectId,
        versionId,
        data: {
          grossAreaM2: data.grossAreaM2,
          spaces: data.spaces.map((s) => ({
            id: s.id,
            name: s.name,
            areaM2: s.areaM2,
          })),
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetBuildingQueryKey(projectId, versionId) });
      toast({
        title: "Building updated",
        description: "Building details have been saved for this version.",
      });
    } catch (e: unknown) {
      const { title, description } = blockedEditToast(e);
      toast({ variant: "destructive", title, description });
    }
  };

  const calculatedTotalSpace = form.watch("spaces").reduce((sum, space) => sum + (Number(space.areaM2) || 0), 0);
  const grossArea = Number(form.watch("grossAreaM2") || 0);

  const loadError = buildingError
    ? buildingError instanceof Error
      ? buildingError
      : new Error("Failed to load building")
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Building details</h1>
          <p className="text-muted-foreground mt-1">
            Gross area and spaces for <span className="font-medium">version {version?.versionNumber ?? "…"}</span>. Data is stored per
            version.
          </p>
        </div>

        <ProjectNav projectId={projectId} versionId={versionId} />

        {isTenantEditor && !readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setBimImportOpen(true)}>
              <Box className="mr-2 h-4 w-4" />
              Import from IFC (BIM)
            </Button>
          </div>
        ) : null}

        <BimImportDialog
          projectId={projectId}
          versionId={versionId}
          open={bimImportOpen}
          onOpenChange={setBimImportOpen}
          readOnly={readOnly}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: getGetBuildingQueryKey(projectId, versionId) });
            void queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey(versionId) });
          }}
        />

        {isLocked ? (
          <div
            className="flex items-start gap-3 rounded-lg border border-muted-foreground/30 bg-muted/40 px-4 py-3 text-sm"
            role="status"
          >
            <Lock className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This version is locked</p>
              <p className="text-muted-foreground mt-1">Building data is read-only for reporting and audit.</p>
            </div>
          </div>
        ) : null}

        {!isTenantEditor ? (
          <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You have read-only access. Only tenant editors and admins can change building data.
          </div>
        ) : null}

        <AsyncView loading={buildingLoading} error={loadError} loadingMessage="Loading building data…">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="bg-card border rounded-lg p-6 max-w-md shadow-sm">
                <FormField
                  control={form.control}
                  name="grossAreaM2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross area (m²)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          placeholder="e.g. 5000"
                          {...field}
                          disabled={readOnly}
                          readOnly={readOnly}
                          value={field.value === undefined || field.value === null ? "" : field.value}
                          onChange={(e) => field.onChange(e.target.value === "" ? 0 : e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Spaces</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={readOnly}
                    onClick={() => append({ name: "", areaM2: 0 })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add space
                  </Button>
                </div>

                <div className="bg-card border rounded-lg shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Space name</TableHead>
                        <TableHead className="w-[200px]">Area (m²)</TableHead>
                        <TableHead className="w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            No spaces defined. Add spaces to track specific areas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        fields.map((field, index) => (
                          <TableRow key={field.id}>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`spaces.${index}.name`}
                                render={({ field: f }) => (
                                  <FormItem className="mb-0">
                                    <FormControl>
                                      <Input placeholder="e.g. Office wing A" {...f} disabled={readOnly} readOnly={readOnly} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`spaces.${index}.areaM2`}
                                render={({ field: f }) => (
                                  <FormItem className="mb-0">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        min={0}
                                        {...f}
                                        disabled={readOnly}
                                        readOnly={readOnly}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={readOnly}
                                onClick={() => remove(index)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {fields.length > 0 ? (
                        <TableRow className="bg-muted/30">
                          <TableCell className="font-medium text-right">Sum of spaces</TableCell>
                          <TableCell className="font-medium" colSpan={2}>
                            <span className={grossArea && calculatedTotalSpace > grossArea + 1e-6 ? "text-destructive" : ""}>
                              {calculatedTotalSpace.toFixed(1)} m²
                            </span>
                            {grossArea && calculatedTotalSpace > grossArea + 1e-6 ? (
                              <span className="text-xs text-destructive ml-2 font-normal">Exceeds gross area</span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                {form.formState.errors.spaces?.message ? (
                  <p className="text-sm text-destructive">{String(form.formState.errors.spaces.message)}</p>
                ) : null}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={readOnly || upsertBuilding.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {upsertBuilding.isPending ? "Saving…" : "Save building details"}
                </Button>
              </div>
            </form>
          </Form>
        </AsyncView>
      </div>
    </AppLayout>
  );
}
