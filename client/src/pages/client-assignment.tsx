import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CaseNotesModal } from "@/components/ui/case-notes-modal";
import { Loader2, Search, Plus } from "lucide-react";
import { PersonInfo } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { STATUS_CONFIGS } from "@/lib/constants";
import { useSegment } from "@/contexts/segment-context";
import { cn } from "@/lib/utils"; // Add this import for the cn utility function

const clientAssignmentSchema = z.object({
  clientId: z.string().min(1, "Please select a client"),
  careCategory: z.string().min(1, "Service category is required"),
  careType: z.string().min(1, "Service type is required"),
  serviceProvider: z.string().min(1, "Service provider is required"),
  serviceStartDate: z.string().min(1, "Start date is required"),
  serviceDays: z.array(z.string()).min(1, "At least one service day is required"),
  serviceHours: z.string().min(1, "Hours per day is required").refine(val => {
    const hours = parseInt(val);
    return !isNaN(hours) && hours >= 1 && hours <= 24;
  }, "Hours must be between 1 and 24")
});

type ClientAssignmentFormValues = z.infer<typeof clientAssignmentSchema>;

interface MasterDataType {
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  active: boolean;
}

interface ClientService {
  id: number;
  clientId: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  serviceStartDate: string;
  serviceDays: string[];
  serviceHours: number;
  status: string;
  createdAt: string;
  createdBy: number;
}

export default function ClientAssignment() {
  const { toast } = useToast();
  const { selectedSegment } = useSegment();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedService, setSelectedService] = useState<ClientService | null>(null);
  const [showCaseNotesDialog, setShowCaseNotesDialog] = useState(false);

  const days = [
    { label: "Monday", value: "Monday" },
    { label: "Tuesday", value: "Tuesday" },
    { label: "Wednesday", value: "Wednesday" },
    { label: "Thursday", value: "Thursday" },
    { label: "Friday", value: "Friday" },
    { label: "Saturday", value: "Saturday" },
    { label: "Sunday", value: "Sunday" }
  ];

  // Fetch master data with segment filtering
  const { data: masterData = [] } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data", selectedSegment?.id],
    queryFn: async () => {
      const url = selectedSegment 
        ? `/api/master-data?segmentId=${selectedSegment.id}` 
        : "/api/master-data";
      const response = await fetch(url, { 
        credentials: "include",
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error("Failed to fetch master data");
      }
      return response.json();
    },
    enabled: !!selectedSegment,
    staleTime: 5000,
  });

  // Get unique categories, types, and providers from active services only
  const activeMasterData = masterData.filter(item => item.active);

  const uniqueCategories = Array.from(new Set(activeMasterData
    .filter(item => item.serviceCategory?.trim())
    .map(item => item.serviceCategory)
  ));
  
  const uniqueTypes = Array.from(new Set(activeMasterData
    .filter(item => item.serviceCategory === selectedCategory && item.serviceType?.trim())
    .map(item => item.serviceType)
  ));
  
  const activeProviders = Array.from(new Set(activeMasterData
    .filter(item => 
      item.serviceProvider?.trim() &&
      item.serviceCategory === selectedCategory &&
      item.serviceType === selectedType
    )
    .map(item => item.serviceProvider)
  ));

  // Fetch all clients with segment filtering
  const { data: clients = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info", selectedSegment?.id],
    queryFn: async () => {
      if (!selectedSegment) {
        return [];
      }
      const url = `/api/person-info?segmentId=${selectedSegment.id}`;
      console.log("Fetching clients from:", url);
      
      const response = await fetch(url, { 
        credentials: "include",
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch clients");
      }
      
      return response.json();
    },
    enabled: !!selectedSegment,
    staleTime: 5000,
  });

  // Get URL parameters after clients are fetched
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get("clientId");
    const clientName = params.get("name");

    if (clientId && clientName && clients.length > 0) {
      setSearchTerm(decodeURIComponent(clientName));
      const client = clients.find(c => c.id === parseInt(clientId));
      if (client) {
        handleSelectClient(client);
      }
    }
  }, [clients]);

  // Fetch client services with segment filtering
  const { data: clientServices = [], isLoading: isServicesLoading, error: servicesError } = useQuery<ClientService[]>({
    queryKey: ["/api/client-services/client", selectedClient?.id, selectedSegment?.id],
    queryFn: async () => {
      if (!selectedClient) {
        return [];
      }
      
      const url = selectedSegment
        ? `/api/client-services/client/${selectedClient.id}?segmentId=${selectedSegment.id}`
        : `/api/client-services/client/${selectedClient.id}`;
        
      console.log("Fetching client services from:", url);
      
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch client services");
      }
      
      return response.json();
    },
    enabled: !!selectedClient && !!selectedSegment,
    staleTime: 5000,
  });

  // Form setup
  const form = useForm<ClientAssignmentFormValues>({
    resolver: zodResolver(clientAssignmentSchema),
    defaultValues: {
      clientId: "",
      careCategory: "",
      careType: "",
      serviceProvider: "",
      serviceStartDate: "",
      serviceDays: [],
      serviceHours: "",
    },
  });

  // Handle client selection
  const handleSelectClient = (client: PersonInfo) => {
    console.log("Selected client:", client);
    setSelectedClient(client);
    setSearchTerm(`${client.firstName} ${client.lastName}`);
    setShowDropdown(false);
    form.setValue("clientId", client.id.toString());
  };

  // Effect to handle search filtering
  useEffect(() => {
    if (searchTerm.length >= 4 && !selectedClient) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [searchTerm, selectedClient]);

  // Watch for changes in the category field
  const watchedCategory = form.watch("careCategory");
  const watchedType = form.watch("careType");

  useEffect(() => {
    if (watchedCategory) {
      setSelectedCategory(watchedCategory);
      form.setValue("careType", "");
      form.setValue("serviceProvider", "");
    }
  }, [watchedCategory, form]);

  useEffect(() => {
    if (watchedType) {
      setSelectedType(watchedType);
      form.setValue("serviceProvider", "");
    }
  }, [watchedType, form]);

  // Watch for dialog open/close
  useEffect(() => {
    if (showDialog) {
      form.reset({
        careCategory: "",
        careType: "",
        serviceProvider: "",
        serviceStartDate: "",
        serviceDays: [],
        serviceHours: ""
      });
      setSelectedCategory("");
      setSelectedType("");
    }
  }, [showDialog, form]);

  // Mutation for submitting the form
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: ClientAssignmentFormValues) => {
      if (!selectedClient) {
        throw new Error("No client selected");
      }
      console.log("[Assign Service] Submitting form data:", data);
      
      // First ensure the master data combination exists
      try {
        await apiRequest("POST", "/api/master-data", {
          serviceCategory: data.careCategory,
          serviceType: data.careType,
          serviceProvider: data.serviceProvider,
          active: true,
          segmentId: selectedSegment?.id || null
        });
      } catch (error) {
        // Ignore error if master data already exists
        console.log("Master data may already exist:", error);
      }
      
      const serviceData = {
        clientId: parseInt(selectedClient.id.toString()),
        serviceCategory: data.careCategory,
        serviceType: data.careType,
        serviceProvider: data.serviceProvider,
        serviceStartDate: data.serviceStartDate,
        serviceDays: data.serviceDays,
        serviceHours: parseInt(data.serviceHours),
        status: "Planned",
        segmentId: selectedSegment?.id || null
      };
      console.log("[Assign Service] Sending serviceData to API:", serviceData);
      const response = await apiRequest("POST", "/api/client-services", serviceData);
      console.log("[Assign Service] API response:", response);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("[Assign Service] Service assignment failed:", errorData);
        throw new Error(errorData.message || "Failed to assign service");
      }
      const result = await response.json();
      console.log("[Assign Service] Service assignment result:", result);
      if (!result.id) {
        throw new Error("Service was not created properly");
      }
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service assigned successfully",
      });
      form.reset();
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/client-services/client", selectedClient?.id, selectedSegment?.id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign service",
        variant: "destructive",
      });
    },
  });

  // Filter clients based on search
  const filteredClients = clients.filter(client =>
    searchTerm.length >= 4 &&
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusOptions = Object.keys(STATUS_CONFIGS)
    .filter(status => ["Planned", "In Progress", "Closed"].includes(status));

  const columns: DataTableColumnDef<ClientService>[] = [
    {
      accessorKey: "serviceCategory",
      header: "Category"
    },
    {
      accessorKey: "serviceType",
      header: "Type"
    },
    {
      accessorKey: "serviceProvider",
      header: "Provider"
    },
    {
      accessorKey: "serviceStartDate",
      header: "Start Date",
      cell: ({ row }) => new Date(row.original.serviceStartDate).toLocaleDateString()
    },
    {
      accessorKey: "serviceDays",
      header: "Days",
      cell: ({ row }) => row.original.serviceDays.join(", ")
    },
    {
      accessorKey: "serviceHours",
      header: "Hours"
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status || 'Not Assigned';
        const config = STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.Closed;
        return (
          <Select
            value={row.original.status}
            onValueChange={async (value) => {
              try {
                await apiRequest("PATCH", `/api/client-services/${row.original.id}`, {
                  status: value
                });
                await queryClient.refetchQueries({ queryKey: ["/api/client-services/client", selectedClient?.id, selectedSegment?.id] });
                toast({
                  title: "Success",
                  description: "Service status updated",
                });
              } catch (error) {
                toast({
                  title: "Error",
                  description: "Failed to update status",
                  variant: "destructive",
                });
              }
            }}
          >
            <SelectTrigger className={cn("w-[130px]", config.color)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
    },
    {
      id: "caseNotes",
      header: "Case Notes",
      cell: ({ row }) => (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            setSelectedService(row.original);
            setShowCaseNotesDialog(true);
          }}
        >
          View/Edit Notes
        </Button>
      )
    }
  ];

  return (
    <AppLayout>
      <div className="container mx-auto p-4">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Client Services</CardTitle>
              </div>
              <Button onClick={() => setShowDialog(true)} disabled={!selectedClient}>
                <Plus className="h-4 w-4 mr-2" />
                Assign Service
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="flex items-center border rounded-md">
                <Search className="h-4 w-4 ml-2 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search Client (minimum 4 characters)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="border-0 focus-ring-0"
                />
              </div>
              {showDropdown && filteredClients.length > 0 && (
                <div className="absolute w-full mt-1 bg-white border rounded-md shadow-lg z-10">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleSelectClient(client)}
                    >
                      {client.title} {client.firstName} {client.lastName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedClient && (
          <Card>
            <CardHeader>
              <CardTitle>Client Services</CardTitle>
            </CardHeader>
            <CardContent>
              {isServicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : servicesError ? (
                <div className="text-red-500">Error loading services: {servicesError.message}</div>
              ) : (
                <DataTable
                  data={clientServices}
                  columns={columns}
                  searchPlaceholder="Search services..."
                />
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign New Service</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={(e) => {
                e.preventDefault();
                console.log("[Form] Starting form submission");
                
                // Set the clientId before handling submission
                if (selectedClient) {
                  form.setValue("clientId", selectedClient.id.toString());
                }

                const formState = form.getValues();
                console.log("[Form] Current form state:", formState);
                
                // Add validation error logging
                const formErrors = form.formState.errors;
                if (Object.keys(formErrors).length > 0) {
                  console.log("[Form] Validation errors:", formErrors);
                  return;
                }
                
                form.handleSubmit((formData: ClientAssignmentFormValues) => {
                  console.log("[Form] Inside onSubmit handler");
                  console.log("[Form] Form data before mutation:", formData);
                  if (!selectedClient) {
                    console.log("[Form] No client selected, returning");
                    return;
                  }
                  createAssignmentMutation.mutate({
                    ...formData,
                    clientId: selectedClient.id.toString()
                  });
                }, (errors) => {
                  console.log("[Form] Form submission failed with errors:", errors);
                })(e);
              }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="careCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Category</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedCategory(value);
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {uniqueCategories.map((category) => (
                              <SelectItem key={category} value={category || "_"}>
                                {category}
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
                    name="careType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedType(value);
                          }} 
                          value={field.value} 
                          disabled={!selectedCategory}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {uniqueTypes.map((type) => (
                              <SelectItem key={type} value={type || "_"}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="serviceProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Provider</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeProviders.map((provider) => (
                              <SelectItem key={provider} value={provider || "_"}>
                                {provider}
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
                    name="serviceStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="serviceDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Days</FormLabel>
                        <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                          {days.map((day) => (
                            <div key={day.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={day.value}
                                checked={field.value?.includes(day.value)}
                                onCheckedChange={(checked) => {
                                  const updatedDays = checked
                                    ? [...field.value || [], day.value]
                                    : field.value?.filter((value) => value !== day.value) || [];
                                  field.onChange(updatedDays);
                                }}
                              />
                              <label
                                htmlFor={day.value}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {day.label}
                              </label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="serviceHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Hours</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min="1" max="24" placeholder="Number of hours per day" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createAssignmentMutation.isPending}
                >
                  {createAssignmentMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Assign Service
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <CaseNotesModal
          isOpen={showCaseNotesDialog}
          onClose={() => setShowCaseNotesDialog(false)}
          service={selectedService}
          onSaved={() => {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/client-services", selectedClient?.id, selectedSegment?.id] 
            });
          }}
        />
      </div>
    </AppLayout>
  );
}