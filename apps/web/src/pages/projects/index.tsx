import React from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Plus, Building2, Globe2, Clock } from "lucide-react";
import { 
  useGetProjects, 
  useGetDashboardSummary,
  useCreateProject,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useAuth } from "@/lib/auth";
import { AsyncView } from "@/components/feedback/AsyncView";

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  locationCountry: z.string().min(1, "Country is required"),
  buildingType: z.string().min(1, "Building type is required"),
});

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isNewProjectOpen, setIsNewProjectOpen] = React.useState(false);

  const projectsQuery = useGetProjects();
  const summaryQuery = useGetDashboardSummary();
  const projectList = projectsQuery.data;
  const projects = projectList?.items ?? [];
  const projectPageMeta = projectList
    ? { total: projectList.total, limit: projectList.limit, offset: projectList.offset }
    : null;
  const summary = summaryQuery.data;
  const listLoading = projectsQuery.isLoading || summaryQuery.isLoading;
  const listError = projectsQuery.error ?? summaryQuery.error ?? null;
  const createProject = useCreateProject();

  const form = useForm<z.infer<typeof createProjectSchema>>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      locationCountry: "Finland",
      buildingType: "office",
    },
  });

  const onSubmit = async (data: z.infer<typeof createProjectSchema>) => {
    try {
      const newProject = await createProject.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setIsNewProjectOpen(false);
      form.reset();
      setLocation(`/projects/${newProject.id}`);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              Manage your lifecycle carbon calculations for {user?.tenantName}.
            </p>
          </div>
          
          <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Set up a new building project to start calculating emissions.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Helsinki Office Tower" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="locationCountry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="buildingType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Building Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="office">Office</SelectItem>
                              <SelectItem value="residential">Residential</SelectItem>
                              <SelectItem value="commercial">Commercial</SelectItem>
                              <SelectItem value="industrial">Industrial</SelectItem>
                              <SelectItem value="educational">Educational</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <DialogFooter className="mt-6">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsNewProjectOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createProject.isPending}>
                      {createProject.isPending ? "Creating..." : "Create Project"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <AsyncView loading={listLoading} error={listError}>
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.totalProjects}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Drafts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.draftVersions}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Locked Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summary.lockedVersions}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="bg-card border rounded-lg shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Project Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No projects found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow 
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {project.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Globe2 className="h-3.5 w-3.5" />
                        {project.locationCountry}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {project.buildingType}
                    </TableCell>
                    <TableCell>
                      {project.latestVersionStatus ? (
                        <Badge 
                          variant={project.latestVersionStatus === "locked" ? "default" : "secondary"}
                          className={project.latestVersionStatus === "draft" ? "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200" : ""}
                        >
                          v{project.latestVersionNumber} {project.latestVersionStatus}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No versions</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      <div className="flex items-center justify-end gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {format(new Date(project.updatedAt), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {projectPageMeta && projectPageMeta.total > projects.length ? (
            <p className="text-sm text-muted-foreground px-4 py-2 border-t">
              Showing {projects.length} of {projectPageMeta.total} projects (limit {projectPageMeta.limit}, offset{" "}
              {projectPageMeta.offset}).
            </p>
          ) : null}
        </div>
        </AsyncView>
      </div>
    </AppLayout>
  );
}
