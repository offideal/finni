import React, { useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetBuilding,
  useUpsertBuilding,
  getGetBuildingQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Save } from "lucide-react";

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

const buildingSchema = z.object({
  grossAreaM2: z.coerce.number().min(1, "Gross area must be positive").optional().or(z.literal("")),
  spaces: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Space name is required"),
      areaM2: z.coerce.number().min(0.1, "Area must be positive"),
    })
  ),
});

export default function ProjectBuilding({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: building, isLoading } = useGetBuilding(projectId, { query: { enabled: !!projectId } });
  const upsertBuilding = useUpsertBuilding();

  const form = useForm<z.infer<typeof buildingSchema>>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      grossAreaM2: "",
      spaces: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "spaces",
  });

  // Init form
  const initRef = React.useRef(false);
  useEffect(() => {
    if (building && !initRef.current) {
      initRef.current = true;
      form.reset({
        grossAreaM2: building.grossAreaM2 || "",
        spaces: building.spaces.map(s => ({ id: s.id, name: s.name, areaM2: s.areaM2 })),
      });
    }
  }, [building, form]);

  const onSubmit = async (data: z.infer<typeof buildingSchema>) => {
    try {
      await upsertBuilding.mutateAsync({
        projectId,
        data: {
          grossAreaM2: data.grossAreaM2 === "" ? null : Number(data.grossAreaM2),
          spaces: data.spaces.map(s => ({
            id: s.id,
            name: s.name,
            areaM2: Number(s.areaM2)
          })),
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetBuildingQueryKey(projectId) });
      toast({
        title: "Building updated",
        description: "Building details have been saved successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to save building.",
      });
    }
  };

  const calculatedTotalSpace = form.watch("spaces").reduce((sum, space) => sum + (Number(space.areaM2) || 0), 0);
  const grossArea = Number(form.watch("grossAreaM2") || 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Building Details</h1>
          <p className="text-muted-foreground mt-1">
            Manage gross area and specific spaces for the project.
          </p>
        </div>

        <ProjectNav projectId={projectId} />

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="bg-card border rounded-lg p-6 max-w-md shadow-sm">
                <FormField
                  control={form.control}
                  name="grossAreaM2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gross Area (m²)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="e.g. 5000" {...field} />
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
                    onClick={() => append({ name: "", areaM2: 0 })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Space
                  </Button>
                </div>

                <div className="bg-card border rounded-lg shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Space Name</TableHead>
                        <TableHead className="w-[200px]">Area (m²)</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
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
                                      <Input placeholder="e.g. Office Wing A" {...f} />
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
                                      <Input type="number" step="0.1" {...f} />
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
                                onClick={() => remove(index)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {fields.length > 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell className="font-medium text-right">Sum of Spaces:</TableCell>
                          <TableCell className="font-medium" colSpan={2}>
                            <span className={grossArea && calculatedTotalSpace > grossArea ? "text-destructive" : ""}>
                              {calculatedTotalSpace.toFixed(1)} m²
                            </span>
                            {grossArea && calculatedTotalSpace > grossArea && (
                              <span className="text-xs text-destructive ml-2 font-normal">
                                Exceeds gross area!
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={upsertBuilding.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {upsertBuilding.isPending ? "Saving..." : "Save Building Details"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </AppLayout>
  );
}
