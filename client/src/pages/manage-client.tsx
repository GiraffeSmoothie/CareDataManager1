import React, { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { insertPersonInfoSchema, type PersonInfo } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";
import DashboardLayout from "../layouts/dashboard-layout";
import { useToast } from "../hooks/use-toast";
import { Loader2, CalendarIcon, Search, Plus } from "lucide-react";

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
  CardDescription,
  CardHeader,
  CardTitle 
} from "../components/ui/card";
import { Calendar } from "../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

const personInfoSchema = insertPersonInfoSchema.extend({
  dateOfBirth: z.string()
    .refine((date) => {
      try {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime());
      } catch {
        return false;
      }
    }, {
      message: "Please enter a valid date",
    }),
  email: z.string().optional(),
  mobilePhone: z.string().optional(),
  postCode: z.string().optional(),   
  hcpEndDate: z.string().optional(),
  nextOfKinEmail: z.string().email().optional().or(z.literal("")),
  status: z.enum(["Created", "Active", "Paused", "Closed"]).default("Created"), 
  title: z.string().optional(), 
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  email: z.string().optional(),
  mobilePhone: z.string().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinAddress: z.string().optional(),

});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

export default function ManageClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [useHomeAddress, setUseHomeAddress] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Add client");
  const [isEditing, setIsEditing] = useState(false);

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    staleTime: 10000,
  });

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
      hcpEndDate: "",
      status: "Created", 
    },
  });

  // Filter clients based on search term
  const filteredClients = members.filter(client => 
    searchTerm.length === 0 || 
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle edit client
  const handleEdit = (client: PersonInfo) => {
    setSelectedMember(client);
    setIsEditing(true);
    setButtonLabel("Update client");
    setShowDialog(true);

    // Populate form with client data
    Object.entries(client).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdBy') {
        form.setValue(key as any, value || "");
      }
    });
  };

  // Handle add new
  const handleAddNew = () => {
    setSelectedMember(null);
    setIsEditing(false);
    setButtonLabel("Add client");
    setShowDialog(true);
    form.reset();
  };

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

  const mutation = useMutation({
    mutationFn: async (data: PersonInfoFormValues) => {
      const response = await apiRequest("POST", "/api/person-info", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
      toast({
        title: "Success",
        description: "Client information updated successfully",
      });
      setShowDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update client information",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PersonInfoFormValues) => {
    mutation.mutate(data);
  };

  const hcpLevels = ["1", "2", "3", "4"];
  const statusOptions = ["Created", "Active", "Paused", "Closed"];

  return (
    <DashboardLayout>
      <div className="container py-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Client Management</CardTitle>
              <div className="flex gap-2">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>{client.title} {client.firstName} {client.lastName}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{client.mobilePhone}</TableCell>
                    <TableCell>{client.status}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(client)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Client' : 'Add New Client'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <Tabs defaultValue="personal" className="w-full">
                  <TabsList className="grid grid-cols-4 mb-6">
                    <TabsTrigger value="personal">Personal Details</TabsTrigger>
                    <TabsTrigger value="address">Address</TabsTrigger>
                    <TabsTrigger value="nextOfKin">Next of Kin</TabsTrigger>
                    <TabsTrigger value="hcp">HCP Information</TabsTrigger>
                  </TabsList>

                  <TabsContent value="personal" className="space-y-6">
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
                                    {field.value ? (
                                      format(new Date(field.value), "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      field.onChange(date.toISOString().split('T')[0]);
                                    }
                                  }}
                                  disabled={(date) => date > new Date()}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
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
                  </TabsContent>

                  <TabsContent value="address" className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Home Address</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="addressLine1"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address Line 1 (mandatory)</FormLabel>
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
                              <FormLabel>Post Code (mandatory)</FormLabel>
                              <FormControl>
                                <Input placeholder="Post code" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Mailing Address</h3>
                        <div className="flex items-center space-x-2">
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
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Same as home address
                          </label>
                        </div>
                      </div>

                      <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", useHomeAddress && "opacity-50")}>
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
                                  disabled={useHomeAddress}
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
                                  disabled={useHomeAddress}
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
                                  disabled={useHomeAddress}
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
                                  disabled={useHomeAddress}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="nextOfKin" className="space-y-6">
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
                  </TabsContent>

                  <TabsContent value="hcp" className="space-y-6">
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
                        name="hcpEndDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>HCP End Date</FormLabel>
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
                                    {field.value ? (
                                      format(new Date(field.value), "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      field.onChange(date.toISOString().split('T')[0]);
                                    }
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6">
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
                    ) : buttonLabel}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}