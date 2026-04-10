import React from "react";
import { format } from "date-fns";
import {
  useGetUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getGetUsersQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Shield, ShieldAlert, ShieldCheck, Trash2, User } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AsyncView, EmptyState } from "@/components/feedback/AsyncView";

const createUserSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "editor", "reviewer", "viewer"] as const),
});

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isNewUserOpen, setIsNewUserOpen] = React.useState(false);
  const [userToRemove, setUserToRemove] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  React.useEffect(() => {
    if (isAdmin === false) {
      setLocation("/projects");
    }
  }, [isAdmin, setLocation]);

  const {
    data: users,
    isLoading,
    isError,
    error,
  } = useGetUsers({
    query: { enabled: !!isAdmin },
  });

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: "viewer",
    },
  });

  const onSubmit = async (data: z.infer<typeof createUserSchema>) => {
    try {
      await createUser.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      setIsNewUserOpen(false);
      form.reset();
      toast({ title: "User created" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not create user", description: errMessage(e) });
    }
  };

  const handleRoleChange = async (userId: string, nextRole: string, previousRole: string) => {
    if (nextRole === previousRole) return;
    try {
      await updateUser.mutateAsync({ id: userId, data: { role: nextRole as "admin" | "editor" | "reviewer" | "viewer" } });
      queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      if (userId === currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
      toast({ title: "Role updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Could not update role", description: errMessage(e) });
    }
  };

  const confirmRemove = async () => {
    if (!userToRemove) return;
    try {
      await deleteUser.mutateAsync({ id: userToRemove.id });
      queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
      setUserToRemove(null);
      toast({ title: "User removed" });
      if (userToRemove.id === currentUser?.id) {
        queryClient.clear();
        window.location.href = "/login";
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Could not remove user", description: errMessage(e) });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <ShieldAlert className="h-4 w-4 text-destructive" />;
      case "reviewer":
        return <ShieldCheck className="h-4 w-4 text-primary" />;
      case "editor":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!isAdmin) return null;

  const loadError = isError ? (error instanceof Error ? error : new Error("Failed to load users")) : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1">
              Manage access and roles for your organization. Only tenant admins can view and change members.
            </p>
          </div>

          <Dialog open={isNewUserOpen} onOpenChange={setIsNewUserOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a user in your tenant with a temporary password. They can sign in with this email and password.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Matti Meikäläinen" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="matti@example.fi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Temporary Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="reviewer">Reviewer</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="mt-6">
                    <Button type="button" variant="outline" onClick={() => setIsNewUserOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending ? "Creating…" : "Create User"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <AsyncView loading={isLoading} error={loadError} loadingMessage="Loading users…">
            <EmptyState when={!users || users.length === 0} message="No users in this tenant yet. Add a user to get started.">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users!.map((u) => {
                    const busy =
                      (updateUser.isPending && updateUser.variables?.id === u.id) ||
                      (deleteUser.isPending && deleteUser.variables?.id === u.id);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.fullName}
                          {u.id === currentUser?.id ? (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[200px]">
                            {getRoleIcon(u.role)}
                            <Select
                              value={u.role}
                              disabled={busy}
                              onValueChange={(val) => void handleRoleChange(u.id, val, u.role)}
                            >
                              <SelectTrigger className="h-9 w-[150px] capitalize">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="reviewer">Reviewer</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                          {format(new Date(u.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => setUserToRemove({ id: u.id, label: u.fullName })}
                            aria-label={`Remove ${u.fullName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </EmptyState>
          </AsyncView>
        </div>

        <AlertDialog open={!!userToRemove} onOpenChange={(open) => !open && setUserToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove user from tenant?</AlertDialogTitle>
              <AlertDialogDescription>
                {userToRemove
                  ? `This will remove ${userToRemove.label} from your organization. They will no longer be able to sign in unless added again.`
                  : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void confirmRemove()}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
