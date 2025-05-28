import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreVertical, Edit2, Users, UserPlus } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Form validation schema
const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["user", "admin"]).default("user"),
  company_id: z.number().optional(),
});

// Schema for editing user - password is optional
const editUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().refine(val => val === '' || val.length >= 6, {
    message: "Password must be at least 6 characters if provided",
  }),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["user", "admin"]).default("user"),
  company_id: z.number().optional(),
});

// Use the create user schema type as our base form type
type UserFormValues = z.infer<typeof createUserSchema>;

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  company_id?: number;
}

interface Company {
  company_id: number;
  company_name: string;
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

  // Fetch all companies
  const { data: companies = [], isLoading: isLoadingCompanies, error: companiesError } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/companies");
        if (!response.ok) {
          throw new Error("Failed to fetch companies");
        }
        return response.json();
      } catch (error: any) {
        console.error("[client] Error fetching companies:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to fetch companies",
          variant: "destructive"
        });
        throw error;
      }
    },
  });

  if (error || companiesError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <ErrorDisplay 
            variant="card"
            title="Error Loading Data"
            message={(error || companiesError) instanceof Error ? (error || companiesError)?.message || "Failed to load data" : "Failed to load data"}
          />
        </div>
      </AppLayout>
    );
  }  // Create a resolver that uses the appropriate schema based on the editing state
  const dynamicResolver = useCallback(
    (data: any, context: any, options: any) => {
      const schema = isEditing ? editUserSchema : createUserSchema;
      return zodResolver(schema)(data, context, options);
    },
    [isEditing]
  );

  // Form setup with the dynamic resolver
  const form = useForm<UserFormValues>({
    resolver: dynamicResolver,
    defaultValues: {
      username: "",
      password: "",
      name: "",
      role: "user",
      company_id: undefined,
    },
    mode: "onBlur"
  });  const mutation = useMutation({
    mutationFn: async (data: UserFormValues) => {      if (isEditing && selectedUser) {
        // Create a new object with only the fields we want to update
        const updateData: Partial<UserFormValues> = {
          name: data.name,
          role: data.role,
          company_id: data.company_id,
        };
        
        // Only include password if it's not empty
        if (data.password && data.password.trim() !== '') {
          updateData.password = data.password;
        }
        
        const response = await apiRequest("PUT", `/api/users/${selectedUser.id}`, updateData);
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
      queryClient.invalidateQueries({ queryKey: ["companies"] });
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
  });  const handleEdit = (user: User) => {
    setSelectedUser(user);
    // First update the editing state so the resolver will use editUserSchema
    setIsEditing(true); 
    setShowDialog(true);
    
    // After setting editing mode, reset the form with user data
    setTimeout(() => {
      form.reset({
        username: user.username,
        name: user.name,
        role: user.role as "user" | "admin",
        company_id: user.company_id,
        password: "", // Don't populate password field when editing
      });
      
      // Ensure no validation errors are shown initially
      form.clearErrors();
    }, 0);
  };
  
  const handleAddNew = () => {
    setSelectedUser(null);
    // First update the editing state so the resolver will use createUserSchema
    setIsEditing(false);
    setShowDialog(true);
    
    // After setting create mode, reset the form
    setTimeout(() => {
      form.reset({
        username: "",
        password: "",
        name: "",
        role: "user",
        company_id: undefined,
      });
      
      // Ensure no validation errors are shown initially
      form.clearErrors();
    }, 0);
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
      accessorKey: "company_id",
      header: "Company",
      cell: ({ row }) => {
        if (!row.original.company_id) {
          return <span className="text-muted-foreground">No company assigned</span>;
        }
        const company = companies.find(c => c.company_id === row.original.company_id);
        if (!company) {
          return <span className="text-yellow-600">Unable to find company details</span>;
        }
        return <span className="font-medium">{company.company_name}</span>;
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Enhanced Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">
              Manage user accounts, roles, and permissions
            </p>
          </div>
          <Button onClick={handleAddNew} className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add New User
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  System Users
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage all user accounts
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading || isLoadingCompanies ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <DataTable
                data={users}
                columns={columns}
                searchPlaceholder="Search users..."
                searchColumn="username"
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
                />                <FormField
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
                      {isEditing && (
                        <p className="text-xs text-muted-foreground mt-1">
                          If you don't want to change the password, leave this field blank.
                        </p>
                      )}
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

                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {companies.map((company) => (
                            <SelectItem 
                              key={company.company_id} 
                              value={company.company_id.toString()}
                            >
                              {company.company_name}
                            </SelectItem>
                          ))}
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
    </AppLayout>
  );
}
