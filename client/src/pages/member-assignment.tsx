import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/layouts/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Upload } from "lucide-react";
import { PersonInfo, MasterData } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { careCategories, getCareTypesByCategory } from "@/lib/data";

// Create schema for the form
const memberAssignmentSchema = z.object({
  memberId: z.string().min(1, "Please select a member"),
  careCategory: z.string().min(1, "Care category is required"),
  careType: z.string().min(1, "Care type is required"),
  document: z.instanceof(FileList).optional(),
  notes: z.string().optional(),
});

type MemberAssignmentFormValues = z.infer<typeof memberAssignmentSchema>;

export default function MemberAssignment() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [careTypes, setCareTypes] = useState<string[]>([]);
  const [documentName, setDocumentName] = useState<string | null>(null);

  // Fetch all members
  const {
    data: members = [],
    isLoading: isLoadingMembers,
    error: membersError,
  } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Form setup
  const form = useForm<MemberAssignmentFormValues>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: {
      memberId: "",
      careCategory: "",
      careType: "",
      notes: "",
    },
  });

  // Watch for changes in the category field
  const watchedCategory = form.watch("careCategory");

  // Update care types when category changes
  useEffect(() => {
    if (watchedCategory) {
      setSelectedCategory(watchedCategory);
      const types = getCareTypesByCategory(watchedCategory);
      // Extract the values for the care types
      const careTypeValues = types.map(type => type.value);
      setCareTypes(careTypeValues);
      
      // Reset care type when category changes
      form.setValue("careType", "");
    }
  }, [watchedCategory, form]);

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setDocumentName(files[0].name);
      form.setValue("document", files);
    } else {
      setDocumentName(null);
      form.setValue("document", undefined);
    }
  };

  // Mutation for submitting the form
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: MemberAssignmentFormValues) => {
      // Create FormData to handle file upload
      const formData = new FormData();
      formData.append("memberId", data.memberId);
      formData.append("careCategory", data.careCategory);
      formData.append("careType", data.careType);
      
      if (data.notes) {
        formData.append("notes", data.notes);
      }
      
      if (data.document && data.document.length > 0) {
        formData.append("document", data.document[0]);
      }
      
      const response = await apiRequest("POST", "/api/member-assignment", formData, true);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member assignment has been created",
      });
      
      // Reset form
      form.reset();
      setDocumentName(null);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/master-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create assignment",
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (data: MemberAssignmentFormValues) => {
    createAssignmentMutation.mutate(data);
  };

  // Handle loading state
  if (isLoadingMembers) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Handle error state
  if (membersError) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Data</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                {membersError?.message || "There was an error loading the member data."}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Member Care Assignment</CardTitle>
            <CardDescription>
              Assign care category and type to a member and upload relevant documentation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Member Selection */}
                <FormField
                  control={form.control}
                  name="memberId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Member</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a member" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.title} {member.firstName} {member.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the member to assign care services
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Care Category Selection */}
                  <FormField
                    control={form.control}
                    name="careCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Care Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {careCategories.map((category) => (
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

                  {/* Care Type Selection */}
                  <FormField
                    control={form.control}
                    name="careType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Care Type</FormLabel>
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
                            {careTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {!selectedCategory && "Select a care category first"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Additional notes about this assignment"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Document Upload */}
                <div className="space-y-2">
                  <FormLabel>Upload Document</FormLabel>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("document-upload")?.click()}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Choose File
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {documentName || "No file chosen"}
                    </span>
                    <input
                      id="document-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supported formats: PDF, DOC, DOCX, JPG, JPEG, PNG
                  </p>
                </div>

                <Separator className="my-6" />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createAssignmentMutation.isPending}
                >
                  {createAssignmentMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Assign Care & Upload Document
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}