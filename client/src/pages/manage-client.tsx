import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { insertPersonInfoSchema, type PersonInfo, CompanySegment } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";
import AppLayout from "../layouts/app-layout";
import { useToast } from "../hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { STATUS_CONFIGS, getStatusBadgeColors } from '@/lib/constants';
import { ErrorDisplay } from "@/components/ui/error-display";


import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { 
  Card,
  CardContent,
  CardHeader,
  CardTitle 
} from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { cn } from "../lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


const personInfoSchema = insertPersonInfoSchema.extend({
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((date) => {
      const parsedDate = new Date(date);
      return !isNaN(parsedDate.getTime()) && parsedDate <= new Date();
    }, "Please enter a valid date that is not in the future"),
  middleName: z.string().optional().or(z.literal("")),
  homePhone: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  addressLine3: z.string().optional().or(z.literal("")),
  nextOfKinEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  nextOfKinName: z.string().min(1, "Next of Kin Name is required"),
  nextOfKinAddress: z.string().min(1, "Next of Kin Address is required"),
  nextOfKinPhone: z.string().min(1, "Next of Kin Phone is required"),
  hcpLevel: z.string().min(1, "HCP Level is required"),
  hcpStartDate: z.string().min(1, "HCP Start Date is required"),
  segment_id: z.number({ required_error: "Please select a segment" }),
  status: z.enum(Object.values(CLIENT_STATUSES) as [string, ...string[]]).default(CLIENT_STATUSES.NEW)
});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

export default function ManageClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [useHomeAddress, setUseHomeAddress] = useState(true);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<PersonInfo | null>(null);
  const [hideInactiveClients, setHideInactiveClients] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();


  // Fetch all members
  const { data: members = [], isLoading, error } = useQuery<PersonInfo[]>({

    queryKey: ["/api/person-info"],
  });


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
      useHomeAddress: true,
      nextOfKinName: "",
      nextOfKinAddress: "",
      nextOfKinEmail: "",
      nextOfKinPhone: "",
      hcpLevel: "",
      hcpStartDate: "",
      segment_id: undefined,
      status: "New", 
    },
  });


  // Filter clients based on search term
  const filteredClients = members.filter(client => 
    !hideInactiveClients || (client.status !== "Closed" && client.status !== "Paused")
  );

  // Handle edit client

  const handleEdit = (client: PersonInfo) => {
    setEditingClient(client);
    setShowDialog(true);

    Object.entries(client).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdBy') {
        form.setValue(key as any, value || "");
      }
    });
  };

  const handleAddNew = () => {
    setEditingClient(null);
    setShowDialog(true);
    form.reset();
  };

  const mutation = useMutation({
    mutationFn: async (data: PersonInfoFormValues) => {
      const requestData = {
        ...data,
        status: data.status || (editingClient ? editingClient.status : 'New')
      };

      if (!editingClient) {
        const response = await apiRequest("POST", "/api/person-info", requestData);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to add client');
        }
        return response.json();
      } else if (editingClient?.id) {
        const response = await apiRequest("PUT", `/api/person-info/${editingClient.id}`, requestData);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update client');
        }
        return response.json();
      }
      throw new Error("Invalid operation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
      toast({
        title: "Success",
        description: editingClient ? "Client information updated successfully" : "New client added successfully",
      });
      setShowDialog(false);
      form.reset();
      setEditingClient(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${editingClient ? 'update' : 'add'} client information`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PersonInfoFormValues) => {
    mutation.mutate(data);
  };

  const hcpLevels = ["1", "2", "3", "4"];

  const statusOptions = Object.keys(STATUS_CONFIGS);

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

    },
    {
      accessorKey: "hcpLevel",
      header: "HCP Level",

      cell: ({ row }) => row.original.hcpLevel ? `Level ${row.original.hcpLevel}` : '-'

    },
    {
      accessorKey: "hcpStartDate",
      header: "HCP Start Date",
      cell: ({ row }) => row.original.hcpStartDate ? new Date(row.original.hcpStartDate).toLocaleDateString() : '-'

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

  return (
    <AppLayout>
      <div className="container py-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Clients</CardTitle>
              <div className="flex gap-2">
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
              <Button onClick={handleAddNew}>
                Add New
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-16">
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
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Mr/Mrs/Ms/Dr" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
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
                          <FormLabel>Last Name</FormLabel>
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
                            <Input placeholder="Middle name (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} max={new Date().toISOString().split('T')[0]} />
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
                            <Input type="email" placeholder="Email address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="homePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Home Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="Home phone (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mobilePhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="Mobile phone" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Status" />
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
                  <FormField
                    control={form.control}
                    name="segment_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Segment</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(Number(value))}
                          value={field.value ? String(field.value) : undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select segment" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {segments.map((segment) => (
                              <SelectItem 
                                key={segment.segment_id} 
                                value={String(segment.segment_id)}
                              >
                                {segment.segment_name} ({segment.company_name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Address Section */}
                <div className="space-y-6 pt-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Address</h3>
                  </div>
                  
                  <div>
                    <h4 className="text-md font-medium mb-4">Home Address</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 1</FormLabel>
                            <FormControl>
                              <Input placeholder="Street address" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="addressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 2</FormLabel>
                            <FormControl>
                              <Input placeholder="Apartment, suite, unit, etc. (optional)" {...field} />
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
                            <FormLabel>Address Line 3</FormLabel>
                            <FormControl>
                              <Input placeholder="City, town, etc. (optional)" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="postCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Code</FormLabel>
                            <FormControl>
                              <Input placeholder="Post code" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-medium">Mailing Address</h4>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="useHomeAddress" 
                          checked={form.getValues("useHomeAddress")}
                          onCheckedChange={(checked) => {
                            form.setValue("useHomeAddress", !!checked);
                          }}
                        />
                        <label
                          htmlFor="useHomeAddress"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Same as home address
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="mailingAddressLine1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 1</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Street address" 
                                {...field} 
                                disabled={form.getValues("useHomeAddress")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="mailingAddressLine2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address Line 2</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Apartment, suite, unit, etc. (optional)" 
                                {...field}
                                disabled={form.getValues("useHomeAddress")}
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
                            <FormLabel>Address Line 3</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="City, town, etc. (optional)" 
                                {...field}
                                disabled={form.getValues("useHomeAddress")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="mailingPostCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Code</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Post code" 
                                {...field}
                                disabled={form.getValues("useHomeAddress")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Next of Kin Section */}
                <div className="space-y-6 pt-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Next of Kin</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nextOfKinName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nextOfKinPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="Phone number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nextOfKinEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Email address (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nextOfKinAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next of Kin Address</FormLabel>
                          <FormControl>
                            <Input placeholder="Full address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* HCP Information Section */}
                <div className="space-y-6 pt-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">HCP Information</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hcpLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HCP Level</FormLabel>
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
                        <FormItem>
                          <FormLabel>HCP Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </form>
            </Form>
            
            {/* Sticky button at the bottom of the modal */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-950 pt-4 pb-4 border-t mt-4 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-10 px-6 mx-[-24px]">
              <Button 
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
                onClick={form.handleSubmit(onSubmit)}
              >
                {mutation.isPending ? (
                  <ButtonLoading text="Processing..." />
                ) : editingClient ? "Update client" : "Add client"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}