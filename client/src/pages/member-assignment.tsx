
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
import { Loader2, Search } from "lucide-react";
import { PersonInfo } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { serviceCategories, getServiceTypesByCategory } from "@/lib/data";
import { Editor } from '@tinymce/tinymce-react';

const memberAssignmentSchema = z.object({
  memberId: z.string().min(1, "Please select a member"),
  serviceCategory: z.string().min(1, "Service category is required"),
  serviceType: z.string().min(1, "Service type is required"),
  serviceProvider: z.string().min(1, "Service provider is required"),
  serviceStartDate: z.string().min(1, "Start date is required"),
  serviceDays: z.string().min(1, "Service days are required"),
  serviceHours: z.string().min(1, "Service hours are required"),
  caseNotes: z.string().optional(),
});

type MemberAssignmentFormValues = z.infer<typeof memberAssignmentSchema>;

export default function MemberAssignment() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredMembers, setFilteredMembers] = useState<PersonInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

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
      caseNotes: "",
    },
  });

  // Handle search input change
  useEffect(() => {
    if (searchTerm.length >= 4) {
      const filtered = members.filter(member => 
        `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredMembers(filtered);
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
    setFilteredMembers([]);
    form.setValue("memberId", member.id.toString());
  };

  // Watch for changes in the category field
  const watchedCategory = form.watch("serviceCategory");

  // Update service types when category changes
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
      setSelectedMember(null);
      setSearchTerm("");
      queryClient.invalidateQueries({ queryKey: ["/api/master-data"] });
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
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Member Service Assignment</CardTitle>
            <CardDescription>
              Assign services to a member
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Search Section */}
            <div className="mb-6">
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

                {showDropdown && (
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
            </div>

            {selectedMember && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(createAssignmentMutation.mutate)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="memberId"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

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
                    name="caseNotes"
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
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
