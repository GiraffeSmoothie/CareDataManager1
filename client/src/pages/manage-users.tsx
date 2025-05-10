import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import DashboardLayout from "@/layouts/app-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { ErrorDisplay } from "@/components/ui/error-display";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Form validation schema
const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["user", "admin"]).default("user"),
});

type UserFormValues = z.infer<typeof userSchema>;

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

export default function ManageUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch all users
  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/users");
        if (!response.ok) {
          throw new Error("Failed to fetch users");
        }
        return response.json();
      } catch (error: any) {
        console.error("[client] Error fetching users:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to fetch users",
          variant: "destructive"
        });
        throw error;
      }
    },
  });

  if (error) {
    return (
      <DashboardLayout>
        <ErrorDisplay 
          variant="card"
          title="Error Loading Users"
          message={error instanceof Error ? error.message : "Failed to load users"}
        />
      </DashboardLayout>
    );
  }

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      password: "",
      name: "",
      role: "user",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      if (isEditing && selectedUser) {
        const response = await apiRequest("PUT", `/api/users/${selectedUser.id}`, data);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update user');
        }
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/users", data);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to create user');
        }
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: "Success",
        description: isEditing ? "User updated successfully" : "User created successfully"
      });
      setShowDialog(false);
      form.reset();
      setSelectedUser(null);
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? 'update' : 'create'} user`,
        variant: "destructive"
      });
    }
  });

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsEditing(true);
    setShowDialog(true);
    form.reset({
      username: user.username,
      name: user.name,
      role: user.role as "user" | "admin",
      password: "", // Don't populate password field when editing
    });
  };

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsEditing(false);
    setShowDialog(true);
    form.reset();
  };

  const columns: DataTableColumnDef<User>[] = [
    {
      accessorKey: "username",
      header: "Username"
    },
    {
      accessorKey: "name",
      header: "Name"
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="capitalize">{row.original.role}</span>
      )
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => handleEdit(row.original)}
        >
          Edit
        </Button>
      )
    }
  ];

  return (
    <DashboardLayout>
      <div className="container py-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Users</CardTitle>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add New
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <DataTable
                data={users}
                columns={columns}
                searchPlaceholder="Search users..."
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit User' : 'Add New User'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter username" 
                          {...field} 
                          disabled={isEditing} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter full name" {...field} />
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
                      <FormLabel>{isEditing ? "New Password (leave blank to keep current)" : "Password"}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder={isEditing ? "Enter new password" : "Enter password"}
                          {...field}
                        />
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
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <div className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : isEditing ? "Update User" : "Create User"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
