
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

type MemberAssignmentFormValues = z.infer<typeof memberAssignmentSchema>;

export default function MemberAssignment() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [activeTab, setActiveTab] = useState("assign");

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch member services
  const { data: memberServices = [] } = useQuery({
    queryKey: ["/api/member-assignment", selectedMember?.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedMember,
  });

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

  // Effect to handle search filtering
  useEffect(() => {
    if (searchTerm.length >= 4) {
      const filtered = members.filter(member => 
        `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [searchTerm, members]);

  // Handle member selection
  const handleSelectMember = (member: PersonInfo) => {
    setSelectedMember(member);
    setSearchTerm(`${member.firstName} ${member.lastName}`);
    setShowDropdown(false);
    form.setValue("memberId", member.id.toString());
  };

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
            <CardTitle>Search Member</CardTitle>
            <CardDescription>Select a member to manage their service assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="flex items-center border rounded-md">
                <Search className="h-4 w-4 ml-2 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search member (minimum 4 characters)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
              <CardTitle>Member Service Management</CardTitle>
              <CardDescription>
                Managing services for {selectedMember.title} {selectedMember.firstName} {selectedMember.lastName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="assign">Assign Service</TabsTrigger>
                  <TabsTrigger value="view">View Services</TabsTrigger>
                </TabsList>

                <TabsContent value="assign">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(createAssignmentMutation.mutate)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                  {serviceCategories.map((category) => (
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
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!selectedCategory}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {serviceTypes.map((type) => (
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
                              <FormControl>
                                <Input {...field} placeholder="Enter service provider" />
                              </FormControl>
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
                            <FormLabel>Notes</FormLabel>
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
