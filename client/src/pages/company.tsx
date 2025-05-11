import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";

// Define the company schema
const companySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  registered_address: z.string().min(1, "Registered address is required"),
  postal_address: z.string().min(1, "Postal address is required"),
  contact_person_name: z.string().min(1, "Contact person name is required"),
  contact_person_phone: z.string().min(1, "Contact person phone is required"),
  contact_person_email: z.string().email("Invalid email address"),
});

type CompanyFormValues = z.infer<typeof companySchema>;

interface Company extends CompanyFormValues {
  company_id: number;
  created_at: string;
  created_by: number;
}

export default function CompanyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      company_name: "",
      registered_address: "",
      postal_address: "",
      contact_person_name: "",
      contact_person_phone: "",
      contact_person_email: "",
    },
  });

  // Fetch companies
  const { data: companies, isLoading, error: fetchError } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/companies");
      return response.json();
    },
  });

  if (fetchError) {
    return (
      <AppLayout>
        <ErrorDisplay 
          variant="card"
          title="Error Loading Companies"
          message={fetchError instanceof Error ? fetchError.message : "Failed to load companies"}
        />
      </AppLayout>
    );
  }

  // Add/Update company mutation
  const mutation = useMutation({
    mutationFn: (data: CompanyFormValues) => {
      if (isEditing && selectedCompany) {
        return apiRequest("PUT", `/api/companies/${selectedCompany.company_id}`, data);
      }
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setShowDialog(false);
      form.reset();
      setSelectedCompany(null);
      setIsEditing(false);
      toast({
        title: "Success",
        description: `Company ${isEditing ? "updated" : "created"} successfully`,
      });
    },
    onError: (err: any) => {
      setError(err instanceof Error ? err : new Error(err.message || `Failed to ${isEditing ? "update" : "create"} company`));
    },
  });

  const handleEdit = (company: Company) => {
    setSelectedCompany(company);
    setIsEditing(true);
    form.reset({
      company_name: company.company_name,
      registered_address: company.registered_address,
      postal_address: company.postal_address,
      contact_person_name: company.contact_person_name,
      contact_person_phone: company.contact_person_phone,
      contact_person_email: company.contact_person_email,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedCompany(null);
    setIsEditing(false);
    form.reset();
  };

  const handleAddNew = () => {
    setIsEditing(false);
    setSelectedCompany(null);
    form.reset({
      company_name: "",
      registered_address: "",
      postal_address: "",
      contact_person_name: "",
      contact_person_phone: "",
      contact_person_email: "",
    });
    setShowDialog(true);
  };

  const columns = [
    {
      accessorKey: "company_name",
      header: "Company Name",
    },
    {
      accessorKey: "contact_person_name",
      header: "Contact Person",
    },
    {
      accessorKey: "contact_person_phone",
      header: "Phone",
    },
    {
      accessorKey: "contact_person_email",
      header: "Email",
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="container py-6">
        {error && (
          <ErrorDisplay 
            variant="alert"
            title="Error"
            message={error.message}
            className="mb-4"
            onDismiss={() => setError(null)}
          />
        )}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Companies</CardTitle>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Company
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
                data={companies || []}
                columns={columns}
                searchPlaceholder="Search companies..."
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Company' : 'Add New Company'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registered_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postal_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Phone</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
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
                  ) : isEditing ? "Update Company" : "Create Company"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}