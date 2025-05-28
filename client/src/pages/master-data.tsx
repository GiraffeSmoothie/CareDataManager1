import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Loader2, Database, Activity } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { MasterData as MasterDataType } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import AppLayout from "@/layouts/app-layout";
import { ErrorDisplay } from "@/components/ui/error-display";
import { useSegment } from "@/contexts/segment-context"; // Add segment context import

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
  const [editingData, setEditingData] = useState<MasterDataType | null>(null);  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { selectedSegment } = useSegment(); // Get the selected segment from context
  const [isAdmin, setIsAdmin] = useState(false);
  // Check if user is admin
  const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auth/status');
      return response.json();
    },
  });
  useEffect(() => {
    // Reset isAdmin to false when auth data changes - this ensures we correctly handle logout scenarios
    if (authData?.user?.role === "admin") {
      console.log("User is admin");
      setIsAdmin(true);
    } else {
      console.log("User is not admin");
      setIsAdmin(false);
    }
  }, [authData]);

  // Determine if we should enable the master data query
  // Only fetch data if either:
  // 1. A segment is selected (for any user type), or
  // 2. The user is not an admin (regular users with no company assignment shouldn't exist, but just in case)
  const shouldFetchData = !!selectedSegment || !isAdmin;
  
  console.log("Master data fetch conditions:", {
    selectedSegment: !!selectedSegment,
    isAdmin,
    shouldFetchData
  });

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
  const { data: masterDataList = [], isLoading, refetch, error: queryError } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data", selectedSegment?.id],    queryFn: async () => {
      const url = selectedSegment 
        ? `/api/master-data?segmentId=${selectedSegment.id}` 
        : "/api/master-data";
      const response = await apiRequest("GET", url);
      return await response.json();
    },
    enabled: shouldFetchData,
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
      // Include the segment ID in the request body
      const requestBody = {
        ...data,
        segmentId: selectedSegment?.id || null
      };
      
      const response = await apiRequest("POST", "/api/master-data", requestBody);
      return await response.json();
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
  });  const onSubmit = async (data: MasterDataFormValues) => {
    try {      if (editingData) {
        await apiRequest("PUT", `/api/master-data/${editingData.id}`, {
          serviceCategory: data.serviceCategory,
          serviceType: data.serviceType,
          serviceProvider: data.serviceProvider,
          active: data.active,
          segmentId: selectedSegment?.id || null // Include segment ID in updates too
        });

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
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Enhanced Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Master Data Management</h1>
            <p className="text-muted-foreground">
              {selectedSegment ? `Configure services and providers for ${selectedSegment.segment_name} segment` : "Please select a segment to manage master data"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => {
                setEditingData(null);
                form.reset({
                  serviceCategory: "",
                  serviceType: "",
                  serviceProvider: "",
                  active: true,
                });
                setShowDialog(true);
              }}
              disabled={isAdmin && !selectedSegment}
              title={isAdmin && !selectedSegment ? "Please select a segment first" : "Add new service"}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add New Service
            </Button>
          </div>
        </div>
        {error && (
          <ErrorDisplay 
            variant="alert"
            title="Error"
            message={error.message}
            className="mb-4"
          />
        )}
        {queryError && !isAdmin && (
          <ErrorDisplay 
            variant="alert"
            title="Error Loading Data"
            message={queryError instanceof Error ? queryError.message : "Failed to load master data"}
            className="mb-4"
          />
        )}        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Services Inventory
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage service categories, types, and providers
                </p>
              </div>
              <div className="flex gap-3 items-center">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="active-only"
                    checked={showActiveOnly}
                    onCheckedChange={setShowActiveOnly}
                  />
                  <label htmlFor="active-only" className="text-sm cursor-pointer flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    Show Active Only
                    {showActiveOnly && masterDataList.length > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        ({masterDataList.filter(item => item.active).length}/{masterDataList.length})
                      </span>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </CardHeader><CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : isAdmin && !selectedSegment ? (
              <div className="text-center py-4 text-amber-600">
                <p>Please select a segment from the dropdown in the top left corner</p>
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
    </AppLayout>
  );
}