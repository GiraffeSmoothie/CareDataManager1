import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { insertPersonInfoSchema, type PersonInfo } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";
import AppLayout from "../layouts/app-layout";
import { useToast } from "../hooks/use-toast";
import { Loader2, Plus, CalendarIcon, Users, Activity, Clock, Heart } from "lucide-react";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { getStatusBadgeColors } from '@/lib/constants';
import { ErrorDisplay } from "@/components/ui/error-display";
import { useSegment } from "@/contexts/segment-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const personInfoSchema = insertPersonInfoSchema.extend({
  dateOfBirth: z.string()
    .regex(/^\d{2}-\d{2}-\d{4}$/, "Date must be in DD-MM-YYYY format")
    .refine((date) => {
      // Parse DD-MM-YYYY format
      const [day, month, year] = date.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);
      return !isNaN(parsedDate.getTime()) && 
        parsedDate.getDate() === day &&
        parsedDate.getMonth() === month - 1 &&
        parsedDate.getFullYear() === year &&
        parsedDate <= new Date();
    }, "Please enter a valid date that is not in the future"),
  middleName: z.string().optional().or(z.literal("")),
  homePhone: z.string().optional().or(z.literal(""))
    .refine(val => !val || /^\d{10}$/.test(val), {
      message: "Home phone must be 10 digits (no spaces or symbols)"
    }),
  mobilePhone: z.string().optional().or(z.literal(""))
    .refine(val => !val || /^\d{10}$/.test(val), {
      message: "Mobile phone must be 10 digits (no spaces or symbols)"
    }),  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  postCode: z.string().optional().or(z.literal(""))
    .refine(val => !val || /^\d{4}$/.test(val), {
      message: "Post code must be a 4-digit number"
    }),
  addressLine2: z.string().optional().or(z.literal("")),
  addressLine3: z.string().optional().or(z.literal("")),
  mailingAddressLine1: z.string().optional().or(z.literal("")),
  mailingAddressLine2: z.string().optional().or(z.literal("")),
  mailingAddressLine3: z.string().optional().or(z.literal("")),
  mailingPostCode: z.string().optional().or(z.literal("")),  nextOfKinEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  nextOfKinName: z.string().optional().or(z.literal("")),  
  nextOfKinRelationship: z.string().optional().or(z.literal("")),
  nextOfKinAddress: z.string().optional().or(z.literal("")),
  nextOfKinPhone: z.string().optional().or(z.literal(""))
    .refine(val => !val || /^\d{10}$/.test(val), {
      message: "Next of kin phone must be 10 digits (no spaces or symbols)"
    }),
  hcpLevel: z.string().min(1, "HCP Level is required"),
  hcpStartDate: z.string()
    .regex(/^\d{2}-\d{2}-\d{4}$/, "Date must be in DD-MM-YYYY format")
    .refine((date) => {
      // Parse DD-MM-YYYY format
      const [day, month, year] = date.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);
      return !isNaN(parsedDate.getTime()) &&
        parsedDate.getDate() === day &&
        parsedDate.getMonth() === month - 1 &&
        parsedDate.getFullYear() === year &&
        parsedDate <= new Date();
    }, "Please enter a valid date that is not in the future"),
  status: z.enum(["New", "Active", "Paused", "Closed"]).default("New"),
  segmentId: z.number().nullable().optional()
});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

export default function ManageClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedSegment } = useSegment();
  const [useHomeAddress, setUseHomeAddress] = useState(true);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Add client");
  const [isEditing, setIsEditing] = useState(false);
  const [hideInactiveClients, setHideInactiveClients] = useState(true);

  const form = useForm<PersonInfoFormValues>({
    resolver: zodResolver(personInfoSchema),
    defaultValues: {
      title: "",
      firstName: "",
      middleName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      homePhone: "",
      mobilePhone: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      postCode: "",
      mailingAddressLine1: "",
      mailingAddressLine2: "",
      mailingAddressLine3: "",
      mailingPostCode: "",
      useHomeAddress: true,      nextOfKinName: "",
      nextOfKinRelationship: "",
      nextOfKinAddress: "",
      nextOfKinEmail: "",
      nextOfKinPhone: "",
      hcpLevel: "",
      hcpStartDate: "",
      status: "New", 
      segmentId: selectedSegment?.id || null,
    },
  });
  // Fetch all clients with segment filtering - using a better query approach
  const { data: clients = [], isLoading, error, refetch } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info", selectedSegment?.id],
    queryFn: async () => {
      if (!selectedSegment) {
        return []; // Don't fetch if no segment is selected
      }
      
      const url = `/api/person-info?segmentId=${selectedSegment.id}`;
      console.log("Fetching clients from:", url);
      const response = await apiRequest("GET", url);
      
      if (!response.ok) {
        throw new Error("Failed to fetch clients");
      }
      
      const data = await response.json();
      console.log(`Fetched ${data.length} clients for segment ${selectedSegment.id}`);
      return data;    },
    enabled: !!selectedSegment, // Only run query when we have a segment
    staleTime: 1000, // Keep data fresh for 1 second to match homepage
    refetchOnWindowFocus: true, // Refetch when window gains focus to match homepage
  });

  // Refetch when selected segment changes
  useEffect(() => {
    if (selectedSegment) {
      // Invalidate the query first to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/person-info", selectedSegment.id] });
      refetch();
    }
  }, [selectedSegment, refetch, queryClient]);

  // When useHomeAddress changes, update mailing address fields
  useEffect(() => {
    if (useHomeAddress) {
      const homeAddress = {
        mailingAddressLine1: form.getValues("addressLine1"),
        mailingAddressLine2: form.getValues("addressLine2"),
        mailingAddressLine3: form.getValues("addressLine3"),
        mailingPostCode: form.getValues("postCode"),
        useHomeAddress: true
      };

      Object.entries(homeAddress).forEach(([key, value]) => {
        form.setValue(key as any, value);
      });
    }
  }, [useHomeAddress, form]);

  // Watch for changes on home address fields
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (useHomeAddress && 
         (name === "addressLine1" || name === "addressLine2" || 
          name === "addressLine3" || name === "postCode")) {

        const mailingField = name.replace("address", "mailingAddress").replace("postCode", "mailingPostCode");
        form.setValue(mailingField as any, value[name as keyof typeof value] || "");
      }
    });

    return () => subscription.unsubscribe();
  }, [form, useHomeAddress]);
  // Update form when selected segment changes
  useEffect(() => {
    console.log("Selected segment changed:", selectedSegment);
    // Only set a value if we have a valid segment ID, otherwise use undefined instead of null
    if (selectedSegment?.id) {
      form.setValue("segmentId", selectedSegment.id);
    }
  }, [selectedSegment, form]);
  const mutation = useMutation({
    mutationFn: async (data: PersonInfoFormValues) => {
      console.log("Form data before mutation:", data);
      console.log("Selected segment:", selectedSegment);
        // Ensure segmentId is a valid number or undefined (not null)
      const segmentId = selectedSegment?.id || data.segmentId;
      
      const requestData = {
        ...data,
        status: data.status || (isEditing ? selectedMember?.status : 'New'),
        // If segmentId is null or undefined, don't include it in the request
        ...(segmentId ? { segmentId } : {})
      };
      
      console.log("Request data with segment:", requestData);

      if (!isEditing) {
        const response = await apiRequest("POST", "/api/person-info", requestData);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to add client');
        }
        return response.json();
      } else if (selectedMember?.id) {
        const response = await apiRequest("PUT", `/api/person-info/${selectedMember.id}`, requestData);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update client');
        }
        return response.json();
      }
      throw new Error("Invalid operation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info", selectedSegment?.id] });
      toast({
        title: "Success",
        description: isEditing ? "Client information updated successfully" : "New client added successfully",
      });
      setShowDialog(false);
      form.reset();
      setSelectedMember(null);
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? 'update' : 'add'} client information`,
        variant: "destructive",
      });
    },
  });  const onSubmit = (data: PersonInfoFormValues) => {
    console.log("Form submitted:", data, "isEditing:", isEditing, "selectedMember:", selectedMember);
    
    // The dates should remain in DD-MM-YYYY format to match the schema validation
    // The server expects dates in DD-MM-YYYY format based on the schema validation
    
    // Ensure dates are properly formatted as DD-MM-YYYY
    const ensureCorrectDateFormat = (dateString: string): string => {
      if (!dateString) return dateString;
      
      try {
        // Check if already in DD-MM-YYYY format
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
          return dateString;
        }
        
        // If it's in another format, try to parse and convert to DD-MM-YYYY
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          return `${day}-${month}-${year}`;
        }
      } catch (error) {
        console.error("Error formatting date:", error);
      }
      
      return dateString; // Return original if conversion failed
    };
    
    // Format phone numbers to ensure they match validation (10 digits only)
    const formatPhoneNumber = (phone: string): string => {
      if (!phone) return phone;
      // Remove any non-digit characters and ensure it's just 10 digits
      return phone.replace(/\D/g, '').substring(0, 10);
    };
    
    // Format postcode to ensure it's exactly 4 digits
    const formatPostcode = (postcode: string): string => {
      if (!postcode) return postcode;
      // Remove any non-digit characters and ensure it's just 4 digits
      return postcode.replace(/\D/g, '').substring(0, 4).padStart(4, '0');
    };
      // Format data before submission
    const formattedData = {
      ...data,
      // Format phone numbers
      mobilePhone: data.mobilePhone ? formatPhoneNumber(data.mobilePhone) : data.mobilePhone,
      homePhone: data.homePhone ? formatPhoneNumber(data.homePhone) : data.homePhone,
      nextOfKinPhone: data.nextOfKinPhone ? formatPhoneNumber(data.nextOfKinPhone) : data.nextOfKinPhone,
      
      // Format postcodes
      postCode: data.postCode ? formatPostcode(data.postCode) : data.postCode,
      mailingPostCode: data.mailingPostCode ? formatPostcode(data.mailingPostCode) : data.mailingPostCode,
      
      // Format dates
      dateOfBirth: data.dateOfBirth ? ensureCorrectDateFormat(data.dateOfBirth) : data.dateOfBirth,
      hcpStartDate: data.hcpStartDate ? ensureCorrectDateFormat(data.hcpStartDate) : data.hcpStartDate
    };
    
    mutation.mutate(formattedData);
  };
  const hcpLevels = ["1", "2", "3", "4"];
  const statusOptions = ["New", "Active", "Paused", "Closed"];

  // Filter clients based on search term and active status
  const filteredClients = clients.filter(client => 
    !hideInactiveClients || (client.status !== "Closed" && client.status !== "Paused")
  );  // Handle edit client
  const handleEdit = (client: PersonInfo) => {
    setSelectedMember(client);
    setIsEditing(true);
    setButtonLabel("Update client");
    setShowDialog(true);

    // Populate form with client data
    Object.entries(client).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdBy') {
        // Format phone numbers to ensure they match validation
        if ((key === 'mobilePhone' || key === 'homePhone' || key === 'nextOfKinPhone') && value) {
          // Remove any non-digit characters and ensure it's just 10 digits
          const formattedPhone = String(value).replace(/\D/g, '').substring(0, 10);
          form.setValue(key as any, formattedPhone);
        }
        // Format postcode to ensure it's 4 digits
        else if ((key === 'postCode' || key === 'mailingPostCode') && value) {
          const formattedPostcode = String(value).replace(/\D/g, '').substring(0, 4);
          form.setValue(key as any, formattedPostcode);
        }
        // Convert date from YYYY-MM-DD to DD-MM-YYYY format for date fields
        else if ((key === 'dateOfBirth' || key === 'hcpStartDate') && value && typeof value === 'string') {
          try {
            // Check if it's already in DD-MM-YYYY format
            if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
              form.setValue(key as any, value);
            } else {
              // Assume it's in YYYY-MM-DD format from the server
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                form.setValue(key as any, `${day}-${month}-${year}`);
              } else {
                form.setValue(key as any, value || "");
              }
            }
          } catch (error) {
            console.error(`Error formatting date (${key}):`, error);
            form.setValue(key as any, value || "");
          }
        } else {
          form.setValue(key as any, value || "");
        }
      }
    });
  };

  // Handle add new
  const handleAddNew = () => {
    setSelectedMember(null);
    setIsEditing(false);
    setButtonLabel("Add client");
    setShowDialog(true);
    form.reset({
      ...form.getValues(),
      segmentId: selectedSegment?.id || null,
    });
  };

  const columns: DataTableColumnDef<PersonInfo>[] = [
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`
    },
    {
      accessorKey: "email",
      header: "Email"
    },
    {
      accessorKey: "mobilePhone",
      header: "Phone"
    },    {
      accessorKey: "hcpLevel",
      header: "HCP Level",
      cell: ({ row }) => row.original.hcpLevel ? `Level ${row.original.hcpLevel}` : '-'
    },
    {
      accessorKey: "hcpStartDate",
      header: "HCP Start Date",
      cell: ({ row }) => {
        if (!row.original.hcpStartDate) return '-';
        
        try {
          // Check if in DD-MM-YYYY format
          if (/^\d{2}-\d{2}-\d{4}$/.test(row.original.hcpStartDate)) {
            const [day, month, year] = row.original.hcpStartDate.split('-').map(Number);
            // Create date object (month is 0-indexed in JS)
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString();
          } 
          // Check if in ISO format
          else if (/^\d{4}-\d{2}-\d{2}/.test(row.original.hcpStartDate)) {
            return new Date(row.original.hcpStartDate).toLocaleDateString();
          }
          // Fallback to displaying the raw string
          return row.original.hcpStartDate;
        } catch (error) {
          console.error("Error parsing date:", error);
          return row.original.hcpStartDate; // Return raw value if parsing fails
        }
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColors(row.original.status || 'New')}`}>
          {row.original.status || 'New'}
        </span>
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <ErrorDisplay
            variant="card"
            title="Error Loading Clients"
            message={error instanceof Error ? error.message : "Failed to load client data"}
            className="max-w-md"
          />
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Enhanced Header with Welcome Message */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Client Management</h1>
            <p className="text-muted-foreground">
              {selectedSegment ? `Managing clients for ${selectedSegment.segment_name} segment` : "Please select a segment to view and manage clients"}
            </p>
          </div>
          {selectedSegment && (
            <div className="flex gap-2">
              <Button 
                onClick={handleAddNew}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add New Client
              </Button>
            </div>
          )}
        </div>

        {/* Statistics Cards */}
        {selectedSegment && clients && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Clients
                </CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clients?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  All registered clients
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Clients
                </CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clients?.filter(c => c.status === "Active").length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Currently active
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Paused Clients
                </CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clients?.filter(c => c.status === "Paused").length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Temporarily paused
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  HCP Enrolled
                </CardTitle>
                <Heart className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clients?.filter(c => c.hcpLevel && c.hcpLevel !== "-").length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Health care programs
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Client Directory
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage all client information
                </p>
              </div>
              {selectedSegment && (
                <Button 
                  onClick={handleAddNew}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Client
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedSegment ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <p className="mb-4 text-muted-foreground">Please select a segment from the dropdown in the top left corner</p>
              </div>
            ) : (
              <>
                <div className="flex items-center mb-4">
                  <Checkbox 
                    id="hideInactiveClients" 
                    checked={hideInactiveClients}
                    onCheckedChange={(checked) => setHideInactiveClients(!!checked)}
                  />
                  <label
                    htmlFor="hideInactiveClients"
                    className="ml-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Hide closed and paused clients
                  </label>
                </div>
                <DataTable
                  data={filteredClients}
                  columns={columns}
                  searchPlaceholder="Search clients..."
                />
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{buttonLabel}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Personal Details Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Personal Details</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title <span className="text-red-500">*</span></FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select title" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof"].map((title) => (
                                <SelectItem key={title} value={title}>
                                  {title}
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
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="First name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Last name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="middleName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Middle Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Middle name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date of Birth <span className="text-red-500">*</span></FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? field.value : <span>DD-MM-YYYY</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? (() => {
                                  const [day, month, year] = field.value.split('-').map(Number);
                                  return new Date(year, month - 1, day);
                                })() : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    const day = date.getDate().toString().padStart(2, '0');
                                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                    const year = date.getFullYear();
                                    field.onChange(`${day}-${month}-${year}`);
                                  }
                                }}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            DD-MM-YYYY format (e.g., 01-01-1940)
                          </p>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (Optional)</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">                    <FormField
                      control={form.control}
                      name="homePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Home phone number (10 digits)" {...field} />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            If provided, must be 10 digits without spaces or symbols
                          </p>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mobilePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Mobile phone number (10 digits)" {...field} />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be 10 digits without spaces or symbols
                          </p>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Home Address Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Home Address</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1 <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2 (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Apartment, suite, etc." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine3"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 3 (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Suburb, area, etc." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">                    <FormField
                      control={form.control}
                      name="postCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postcode (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="4-digit postcode" {...field} />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be a 4-digit number
                          </p>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Mailing Address Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2 flex justify-between items-center">
                    <h3 className="text-lg font-medium">Mailing Address</h3>
                    <div className="flex items-center">
                      <Checkbox
                        id="useHomeAddress"
                        checked={useHomeAddress}
                        onCheckedChange={(checked) => {
                          setUseHomeAddress(!!checked);
                          form.setValue("useHomeAddress", !!checked);
                        }}
                      />
                      <label
                        htmlFor="useHomeAddress"
                        className="ml-2 text-sm font-medium leading-none"
                      >
                        Same as home address
                      </label>
                    </div>
                  </div>
                  
                  <div className={cn("space-y-6", useHomeAddress ? "opacity-50" : "")}>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="mailingAddressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mailing Address Line 1</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Street address" 
                                disabled={useHomeAddress} 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="mailingAddressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mailing Address Line 2 (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Apartment, suite, etc." 
                                disabled={useHomeAddress} 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="mailingAddressLine3"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mailing Address Line 3 (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Suburb, area, etc." 
                                disabled={useHomeAddress} 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="mailingPostCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mailing Postcode</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="4-digit postcode" 
                                disabled={useHomeAddress} 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground mt-1">
                              Must be a 4-digit number
                            </p>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Next of Kin Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Next of Kin Details</h3>
                  </div>                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="nextOfKinName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="nextOfKinRelationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relationship (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select relationship" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spouse">Spouse</SelectItem>
                              <SelectItem value="partner">Partner</SelectItem>
                              <SelectItem value="parent">Parent</SelectItem>
                              <SelectItem value="child">Child</SelectItem>
                              <SelectItem value="sibling">Sibling</SelectItem>
                              <SelectItem value="friend">Friend</SelectItem>
                              <SelectItem value="guardian">Guardian</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}                      name="nextOfKinAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Address (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Full address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}                      name="nextOfKinPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Phone number (10 digits)" {...field} />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be 10 digits without spaces or symbols
                          </p>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nextOfKinEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Email (Optional)</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* HCP Details Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">HCP Details</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hcpLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HCP Level <span className="text-red-500">*</span></FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select HCP level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {hcpLevels.map((level) => (
                                <SelectItem key={level} value={level}>
                                  Level {level}
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
                      name="hcpStartDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>HCP Start Date <span className="text-red-500">*</span></FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? field.value : <span>DD-MM-YYYY</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? (() => {
                                  const [day, month, year] = field.value.split('-').map(Number);
                                  return new Date(year, month - 1, day);
                                })() : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    const day = date.getDate().toString().padStart(2, '0');
                                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                    const year = date.getFullYear();
                                    field.onChange(`${day}-${month}-${year}`);
                                  }
                                }}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            DD-MM-YYYY format (e.g., 01-01-2024)
                          </p>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Status Section */}
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Status</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Status</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {statusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      buttonLabel
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}