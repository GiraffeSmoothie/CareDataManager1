import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { MasterData as MasterDataType } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import DashboardLayout from "@/layouts/app-layout";
import { ErrorDisplay } from "@/components/ui/error-display";

const masterDataSchema = z.object({
  serviceCategory: z.string({ required_error: "Please select a service category" }),
  serviceType: z.string({ required_error: "Please select a service type" }),
  serviceProvider: z.string({ required_error: "Please select or enter a service provider" }),
  active: z.boolean().default(true),
});

type MasterDataFormValues = z.infer<typeof masterDataSchema>;

export default function MasterData() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingData, setEditingData] = useState<MasterDataType | null>(null);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Populate form when editing data changes
  useEffect(() => {
    if (editingData) {
      form.reset({
        serviceCategory: editingData.serviceCategory,
        serviceType: editingData.serviceType,
        serviceProvider: editingData.serviceProvider || "",
        active: editingData.active
      });
    }
  }, [editingData]);

  // Fetch all master data for the View tab
  const { data: masterDataList = [], isLoading, refetch } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data"],
  });

  // Sort services by Service Category A -> Z
  const sortedMasterDataList = [...masterDataList].sort((a, b) => {
    if (a.serviceCategory && b.serviceCategory) {
      return a.serviceCategory.localeCompare(b.serviceCategory);
    }
    return 0;
  });

  // Initialize form with default values
  const form = useForm<MasterDataFormValues>({
    resolver: zodResolver(masterDataSchema),
    defaultValues: {
      serviceCategory: "",
      serviceType: "",
      serviceProvider: "",      
      active: true,
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: MasterDataFormValues) => {
      const response = await fetch("/api/master-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create master data");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Data saved successfully",
        variant: "default",
      });
      form.reset();
      setShowDialog(false);
      refetch();
    },
    onError: (error) => {
      setError(error instanceof Error ? error : new Error("Failed to save data"));
    },
  });

  const onSubmit = async (data: MasterDataFormValues) => {
    try {
      if (editingData) {
        const response = await fetch(`/api/master-data/${editingData.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serviceCategory: data.serviceCategory,
            serviceType: data.serviceType,
            serviceProvider: data.serviceProvider,
            active: data.active
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update service");
        }

        toast({
          title: "Success",
          description: "Service updated successfully",
        });
        setShowDialog(false);
        setEditingData(null);
        form.reset();
        refetch();
      } else {
        await saveMutation.mutateAsync(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to save service"));
    }
  };

  const filteredData = sortedMasterDataList.filter(item => 
    (showActiveOnly ? item.active : true)
  );

  const columns: DataTableColumnDef<MasterDataType>[] = [
    {
      accessorKey: "serviceCategory",
      header: "Service Category"
    },
    {
      accessorKey: "serviceType",
      header: "Service Type"
    },
    {
      accessorKey: "serviceProvider",
      header: "Service Provider",
      cell: ({ row }) => row.original.serviceProvider || '-'
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
          row.original.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {row.original.active ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingData(row.original);
            setShowDialog(true);
          }}
        >
          Edit
        </Button>
      )
    }
  ];

  return (
    <DashboardLayout>
      <div className="container py-6">
        {error && (
          <ErrorDisplay 
            variant="alert"
            title="Error"
            message={error.message}
            className="mb-4"
          />
        )}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Services Inventory</CardTitle>
              <div className="flex gap-2 items-center">
                <div className="flex items-center space-x-2 mr-2">
                  <Switch
                    id="active-only"
                    checked={showActiveOnly}
                    onCheckedChange={setShowActiveOnly}
                  />
                  <label htmlFor="active-only" className="text-sm cursor-pointer">
                    Show Active Only
                    {showActiveOnly && masterDataList.length > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({masterDataList.filter(item => item.active).length}/{masterDataList.length})
                      </span>
                    )}
                  </label>
                </div>
                <Button onClick={() => {
                  setEditingData(null);
                  setShowDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : masterDataList.length === 0 ? (
              <div className="text-center py-4">No Services master data found.</div>
            ) : (
              <DataTable
                data={filteredData}
                columns={columns}
                searchPlaceholder="Search services..."
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingData ? 'Edit Service' : 'Add New Service'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="serviceCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Category</FormLabel>
                        <Input {...field} placeholder="Enter service category" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Input {...field} placeholder="Enter service type" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serviceProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Provider</FormLabel>
                        <Input {...field} placeholder="Enter service provider" />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Active</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full">
                  {editingData ? 'Update' : 'Add'} Service
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}