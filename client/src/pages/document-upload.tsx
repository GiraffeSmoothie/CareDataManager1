import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/layouts/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, FileText, ArrowDown, Search } from "lucide-react";
import type { Document, PersonInfo } from "@shared/schema";

// Document types
const documentTypes = ["Identification", "Consent", "Disclaimer"];

// Define the document form schema
const documentFormSchema = z.object({
  memberId: z.string({
    required_error: "Please select a member"
  }),
  documentName: z.string({
    required_error: "Document name is required"
  }).min(2, {
    message: "Document name must be at least 2 characters"
  }),
  documentType: z.string({
    required_error: "Document type is required"
  }),
  file: z.instanceof(FileList).refine((files) => files.length > 0, {
    message: "Please upload a file"
  })
});

type DocumentFormValues = z.infer<typeof documentFormSchema>;

export default function DocumentUpload() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [filteredMembers, setFilteredMembers] = useState<PersonInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    staleTime: 10000,
  });

  // Fetch documents for selected member
  const { data: documents = [], isLoading: loadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents/member", selectedMember?.id],
    enabled: !!selectedMember,
  });

  // Form setup
  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      memberId: "",
      documentName: "",
      documentType: "",
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

  // Select member handler
  const handleSelectMember = (member: PersonInfo) => {
    setSelectedMember(member);
    setSearchTerm(`${member.firstName} ${member.lastName}`);
    setShowDropdown(false);
    form.setValue("memberId", member.id.toString());
  };

  // Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: DocumentFormValues) => {
      const formData = new FormData();
      formData.append("memberId", data.memberId);
      formData.append("documentName", data.documentName);
      formData.append("documentType", data.documentType);

      if (data.file && data.file.length > 0) {
        formData.append("file", data.file[0]);
      }

      const res = await apiRequest("POST", "/api/documents", formData, true);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded",
        description: "The document has been successfully uploaded",
      });

      form.reset({
        memberId: selectedMember?.id.toString() || "",
        documentName: "",
        documentType: "",
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }

      if (selectedMember) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents/member", selectedMember.id] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error uploading document",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (data: DocumentFormValues) => {
    uploadMutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <h1 className="text-3xl font-bold">Document Upload</h1>

        {/* Search Section */}
        <Card>
          <CardHeader>
            <CardTitle>Search Member</CardTitle>
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
          </CardContent>
        </Card>

        {/* Documents List Section */}
        {selectedMember && (
          <Card>
            <CardHeader>
              <CardTitle>Documents for {selectedMember.firstName} {selectedMember.lastName}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDocuments ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>{doc.documentName}</TableCell>
                        <TableCell>{doc.documentType}</TableCell>
                        <TableCell>
                          <a
                            href={`/api/documents/${doc.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center text-sm font-medium text-primary hover:underline"
                          >
                            <ArrowDown className="h-4 w-4 mr-1" />
                            Download
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Section */}
        {selectedMember && (
          <Card>
            <CardHeader>
              <CardTitle>Upload New Document</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                  <FormField
                    control={form.control}
                    name="documentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter document name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="documentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {documentTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
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
                    name="file"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Upload File</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            onChange={(e) => onChange(e.target.files)}
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>Upload Document</>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}