import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CaseNotesDialog } from "@/components/ui/case-notes-modal";
import { Loader2, Search, Plus } from "lucide-react";
import { PersonInfo } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";

import { getServiceTypesByCategory } from "@/lib/data";

const memberAssignmentSchema = z.object({
  memberId: z.string().min(1, "Please select a member"),
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

type MemberAssignmentFormValues = z.infer<typeof memberAssignmentSchema>;

interface MasterDataType {
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  active: boolean;
}

interface MemberService {
  id: number;
  memberId: number;
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

export default function MemberAssignment() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState<MemberService | null>(null);
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

  // Fetch master data
  const { data: masterData = [] } = useQuery<MasterDataType[]>({
    queryKey: ["/api/master-data"],
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

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Get URL parameters after members are fetched
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get("memberId");
    const memberName = params.get("name");

    if (memberId && memberName && members.length > 0) {
      setSearchTerm(decodeURIComponent(memberName));
      const member = members.find(m => m.id === parseInt(memberId));
      if (member) {
        handleSelectMember(member);
      }
    }
  }, [members]);

  // Fetch member services
  const { data: memberServices = [], isLoading: isServicesLoading, error: servicesError } = useQuery<MemberService[]>({
    queryKey: ["/api/member-services/member", selectedMember?.id],
    queryFn: () => 
      selectedMember 
        ? apiRequest("GET", `/api/member-services/member/${selectedMember.id}`).then(res => res.json())
        : Promise.resolve([]),
    enabled: !!selectedMember,
  });

  // Form setup
  const form = useForm<MemberAssignmentFormValues>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: {
      memberId: "",
      careCategory: "",
      careType: "",
      serviceProvider: "",
      serviceStartDate: "",
      serviceDays: [],
      serviceHours: "",
    },
  });

  // Handle member selection
  const handleSelectMember = (member: PersonInfo) => {
    console.log("Selected member:", member); // DEBUG LOG
    setSelectedMember(member);
    setSearchTerm(`${member.firstName} ${member.lastName}`);
    setShowDropdown(false);
    form.setValue("memberId", member.id.toString());
  };

  // Effect to handle search filtering
  useEffect(() => {
    if (searchTerm.length >= 4 && !selectedMember) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [searchTerm, selectedMember]);

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
    mutationFn: async (data: MemberAssignmentFormValues) => {
      if (!selectedMember) {
        throw new Error("No member selected");
      }
      console.log("[Assign Service] Submitting form data:", data);
      
      // First ensure the master data combination exists
      try {
        await apiRequest("POST", "/api/master-data", {
          serviceCategory: data.careCategory,
          serviceType: data.careType,
          serviceProvider: data.serviceProvider,
          active: true
        });
      } catch (error) {
        // Ignore error if master data already exists
        console.log("Master data may already exist:", error);
      }
      
      const serviceData = {
        memberId: parseInt(selectedMember.id.toString()),
        serviceCategory: data.careCategory,
        serviceType: data.careType,
        serviceProvider: data.serviceProvider,
        serviceStartDate: data.serviceStartDate,
        serviceDays: data.serviceDays,
        serviceHours: parseInt(data.serviceHours),
        status: "Planned"
      };
      console.log("[Assign Service] Sending serviceData to API:", serviceData);
      const response = await apiRequest("POST", "/api/member-services", serviceData);
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
      queryClient.invalidateQueries({ queryKey: ["/api/member-services/member", selectedMember?.id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign service",
        variant: "destructive",
      });
    },
  });

  // Filter members based on search
  const filteredMembers = members.filter(member =>
    searchTerm.length >= 4 &&
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4">
        {/* Search Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Client Services</CardTitle>
              </div>
              <Button onClick={() => setShowDialog(true)} disabled={!selectedMember}>
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
              {showDropdown && filteredMembers.length > 0 && (
                <div className="absolute w-full mt-1 bg-white border rounded-md shadow-lg z-10">
                  {filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleSelectMember(member)}
                    >
                      {member.title} {member.firstName} {member.lastName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedMember && (
          <Card>
            <CardHeader>
              <CardTitle>Client Services</CardTitle>
            </CardHeader>
            <CardContent>
              {isServicesLoading && <div>Loading assigned services...</div>}
              {servicesError && <div className="text-red-500">Error loading services: {servicesError.message}</div>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Case Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberServices.length > 0 ? (
                    memberServices.map((service: MemberService) => (
                      <TableRow key={service.id}>
                        <TableCell>{service.serviceCategory}</TableCell>
                        <TableCell>{service.serviceType}</TableCell>
                        <TableCell>{service.serviceProvider}</TableCell>
                        <TableCell>{new Date(service.serviceStartDate).toLocaleDateString()}</TableCell>
                        <TableCell>{service.serviceDays.join(", ")}</TableCell>
                        <TableCell>{service.serviceHours}</TableCell>
                        <TableCell>
                          <Select
                            value={service.status}
                            onValueChange={async (value) => {
                              try {
                                await apiRequest("PATCH", `/api/member-services/${service.id}`, {
                                  status: value
                                });
                                await queryClient.refetchQueries({ queryKey: ["/api/member-services/member", selectedMember?.id] });
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
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Planned">Planned</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setSelectedService(service);
                              setShowCaseNotesDialog(true);
                            }}
                          >
                            View/Edit Notes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">
                        No services assigned yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
                
                // Set the memberId before handling submission
                if (selectedMember) {
                  form.setValue("memberId", selectedMember.id.toString());
                }

                const formState = form.getValues();
                console.log("[Form] Current form state:", formState);
                
                // Add validation error logging
                const formErrors = form.formState.errors;
                if (Object.keys(formErrors).length > 0) {
                  console.log("[Form] Validation errors:", formErrors);
                  return;
                }
                
                form.handleSubmit((formData: MemberAssignmentFormValues) => {
                  console.log("[Form] Inside onSubmit handler");
                  console.log("[Form] Form data before mutation:", formData);
                  if (!selectedMember) {
                    console.log("[Form] No member selected, returning");
                    return;
                  }
                  createAssignmentMutation.mutate({
                    ...formData,
                    memberId: selectedMember.id.toString()
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

        <CaseNotesDialog
          open={showCaseNotesDialog}
          onOpenChange={setShowCaseNotesDialog}
          service={selectedService}
          onSave={() => {
            // Refresh the services data
            queryClient.invalidateQueries({ 
              queryKey: ["/api/member-services", selectedMember?.id] 
            });
          }}
        />
      </div>
    </DashboardLayout>
  );
}