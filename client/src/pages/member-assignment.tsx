import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/layouts/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search } from "lucide-react";
import { PersonInfo } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { serviceCategories, getServiceTypesByCategory } from "@/lib/data";
import { Editor } from '@tinymce/tinymce-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const memberAssignmentSchema = z.object({
  memberId: z.string().min(1, "Please select a member"),
  serviceCategory: z.string().min(1, "Service category is required"),
  serviceType: z.string().min(1, "Service type is required"),
  serviceProvider: z.string().min(1, "Service provider is required"),
  serviceStartDate: z.string().min(1, "Start date is required"),
  serviceDays: z.string().min(1, "Service days are required"),
  serviceHours: z.string().min(1, "Service hours are required"),
  note: z.string().optional(),
});

const staticCategories = [
  { value: "personal_care", label: "Personal Care" },
  { value: "domestic_assistance", label: "Domestic Assistance" },
  { value: "social_support", label: "Social Support" },
  { value: "nursing", label: "Nursing" },
  { value: "allied_health", label: "Allied Health" }
];
const staticServiceTypes = {
  personal_care: [
    { value: "showering", label: "Showering" },
    { value: "dressing", label: "Dressing" },
    { value: "grooming", label: "Grooming" }
  ],
  domestic_assistance: [
    { value: "cleaning", label: "Cleaning" },
    { value: "laundry", label: "Laundry" },
    { value: "meal_prep", label: "Meal Preparation" }
  ],
  social_support: [
    { value: "companionship", label: "Companionship" },
    { value: "transport", label: "Transport" },
    { value: "shopping", label: "Shopping" }
  ],
  nursing: [
    { value: "medication", label: "Medication Management" },
    { value: "wound_care", label: "Wound Care" },
    { value: "health_monitoring", label: "Health Monitoring" }
  ],
  allied_health: [
    { value: "physiotherapy", label: "Physiotherapy" },
    { value: "occupational_therapy", label: "Occupational Therapy" },
    { value: "podiatry", label: "Podiatry" }
  ]
};

const staticServiceProviders = [
  { value: "Darren_handyman", label: "Handyman" },
  { value: "Steve_electrician", label: "Electrician" },
  { value: "Matt_plumber", label: "Plumber" }
  ];


type MemberAssignmentFormValues = z.infer<typeof memberAssignmentSchema>;

export default function MemberAssignment() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [activeTab, setActiveTab] = useState("view"); // Changed default tab to "view"
  const [serviceProviders, setServiceProviders] = useState<string[]>([]); // Added state for service providers

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
  const { data: memberServices = [] } = useQuery({
    queryKey: ["/api/member-assignment", selectedMember?.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedMember,
  });

  // Fetch service providers
  const { data: providers = [] } = useQuery({
    queryKey: ["/api/service-providers"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: masterDataList = [] } = useQuery({
    queryKey: ["/api/master-data"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

//  useEffect(() => {
//    if (providers) {
//      setServiceProviders(providers);
//    }
//  }, [providers]);


  // Filter members based on search
  const filteredMembers = members.filter(member => 
    searchTerm.length >= 4 && 
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Form setup
  const form = useForm<MemberAssignmentFormValues>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: {
      memberId: "",
      serviceCategory: "",
      serviceType: "",
      serviceProvider: "",
      serviceStartDate: "",
      serviceDays: "",
      serviceHours: "",
      note: "",
    },
  });

  // Handle member selection
  const handleSelectMember = (member: PersonInfo) => {
    setSelectedMember(member);
    setSearchTerm(`${member.firstName} ${member.lastName}`);
    setShowDropdown(false);
    form.setValue("memberId", member.id.toString());
  };

  // Effect to handle search filtering
  useEffect(() => {
    if (searchTerm.length >= 4) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [searchTerm]);

  // Watch for changes in the category field
  const watchedCategory = form.watch("serviceCategory");

  useEffect(() => {
    if (watchedCategory) {
      setSelectedCategory(watchedCategory);
      const types = getServiceTypesByCategory(watchedCategory);
      setServiceTypes(types);
      form.setValue("serviceType", "");
    }
  }, [watchedCategory, form]);

  // Mutation for submitting the form
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: MemberAssignmentFormValues) => {
      const response = await apiRequest("POST", "/api/member-assignment", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member assignment has been created",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/member-assignment", selectedMember?.id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create assignment",
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4">
        {/* Search Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Client</CardTitle>
            <CardDescription>Select a Client to manage their service assignments</CardDescription>
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
                  className="border-0 focus:ring-0"
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
              <CardTitle>Client Service Management</CardTitle>
              <CardDescription>
                Managing services for {selectedMember.title} {selectedMember.firstName} {selectedMember.lastName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="view">View Services</TabsTrigger> {/* Moved View to first position */}
                  <TabsTrigger value="assign">Assign Service</TabsTrigger> {/* Moved Assign to second position */}
                </TabsList>

                <TabsContent value="assign">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => {
                      if (!selectedMember) return;
                      createAssignmentMutation.mutate({
                        ...data,
                        memberId: selectedMember.id.toString()
                      });
                    })} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        // In the service category dropdown
                        <FormField
                          control={form.control}
                          name="serviceCategory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Service Category</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {staticCategories.map((category) => (
                                    <SelectItem key={category.value} value={category.value}>
                                      {category.label}
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
                          name="serviceType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Service Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCategory}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {staticServiceTypes[selectedCategory]?.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
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
                                  {staticServiceProviders.map((Provider) => (
                                    <SelectItem key={provider.value} value={provider.value}>
                                      {provider.label}
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
                              <FormControl>
                                <Input {...field} placeholder="e.g., Mon, Wed, Fri" />
                              </FormControl>
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
                                <Input {...field} placeholder="e.g., 9:00 AM - 5:00 PM" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Case Notes</FormLabel>
                            <FormControl>
                              <Editor
                                value={field.value}
                                onEditorChange={(content) => field.onChange(content)}
                                init={{
                                  height: 300,
                                  menubar: false,
                                  plugins: ['advlist', 'autolink', 'lists', 'link', 'charmap', 'preview', 'searchreplace',
                                    'visualblocks', 'fullscreen', 'insertdatetime', 'table', 'code', 'help', 'wordcount'
                                  ],
                                  toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | help'
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
                </TabsContent>

                <TabsContent value="view">
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberServices.length > 0 ? (
                        memberServices.map((service: any) => (
                          <TableRow key={service.id}>
                            <TableCell>{service.serviceCategory}</TableCell>
                            <TableCell>{service.serviceType}</TableCell>
                            <TableCell>{service.serviceProvider}</TableCell>
                            <TableCell>{new Date(service.serviceStartDate).toLocaleDateString()}</TableCell>
                            <TableCell>{service.serviceDays}</TableCell>
                            <TableCell>{service.serviceHours}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Navigate to case notes page with service ID
                                  window.location.href = `/case-notes?serviceId=${service.id}`;
                                }}
                              >
                                Add Case Notes
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={service.status || 'Planned'}
                                onValueChange={async (value) => {
                                  try {
                                    await apiRequest("PATCH", `/api/member-assignment/${service.id}`, {
                                      status: value
                                    });

                                    queryClient.invalidateQueries({ 
                                      queryKey: ["/api/member-assignment", selectedMember?.id]
                                    });

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
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4">
                            No services assigned yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}