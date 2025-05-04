import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AppLayout from "@/layouts/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, FileText, ArrowDown, Search, Plus, Eye } from "lucide-react";
import type { Document, PersonInfo } from "@shared/schema";

// Document types
const documentTypes = ["Identification", "Consent", "Disclaimer"];

// Define the document form schema
const documentFormSchema = z.object({
  memberId: z.string({
    required_error: "Please select a client"
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
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch all members
  const { data: members = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    staleTime: 10000,
  });

  // Filtered members for dropdown
  const filteredMembers = searchTerm.length >= 4
    ? members.filter((member) =>
        `${member.firstName} ${member.lastName}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
    : [];

  // Handle click outside dropdown
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch documents for selected member
  const { data: documents = [], isLoading: loadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents/member", selectedMember?.id],
    queryFn: () => selectedMember 
      ? apiRequest("GET", `/api/documents/member/${selectedMember.id}`).then(res => res.json())
      : Promise.resolve([]),
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

  // Select member handler
  const handleSelectMember = (member: PersonInfo) => {
    setSelectedMember(member);
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

      const res = await apiRequest("POST", "http://localhost:3000/api/documents", formData, true);
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

      // Force refresh documents list
      if (selectedMember) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/documents/member", selectedMember.id],
          exact: true,
          refetchType: 'active'
        });
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
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6 text-base font-sans">
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Client Documents</CardTitle>
              <div className="flex gap-2">
                <Button onClick={() => setShowDialog(true)} disabled={!selectedMember}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Styled search field like Member Assignment */}
            <div className="relative max-w-md mb-4" ref={searchRef}>
              <div className="flex items-center border rounded-md">
                <Search className="h-4 w-4 ml-2 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search Client (minimum 4 characters)"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(e.target.value.length >= 4 && filteredMembers.length > 0);
                  }}
                  onFocus={() => {
                    if (filteredMembers.length > 0) setShowDropdown(true);
                  }}
                  className="border-0 focus:ring-0"
                  autoComplete="off"
                />
              </div>
              {showDropdown && filteredMembers.length > 0 && (
                <div className="absolute w-full mt-1 bg-white border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                  {filteredMembers.map((client) => (
                    <div
                      key={client.id}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setSelectedMember(client);
                        setSearchTerm(`${client.firstName} ${client.lastName}`);
                        setShowDropdown(false);
                        form.setValue("memberId", client.id.toString());
                      }}
                    >
                      {client.title ? client.title + " " : ""}
                      {client.firstName} {client.lastName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents List Section */}
        {selectedMember && (
          <Card className="max-w-5xl mx-auto mt-6">
            <CardHeader>
              <CardTitle>Documents for {selectedMember.firstName} {selectedMember.lastName}</CardTitle>
              <CardDescription>Total documents: {documents.length}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocuments ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No documents found for this client. Click "Add New" to upload documents.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>{doc.documentName}</TableCell>
                        <TableCell>{doc.documentType}</TableCell>
                        <TableCell>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/api/documents/${doc.filename}`, '_blank')}
                              title="View Document"
                            >
                              <Eye className="h-4 w-4 text-blue-600" />
                            </Button>
                            <a
                              href={`/api/documents/${doc.filename}`}
                              download
                              className="inline-flex items-center justify-center text-sm font-medium text-primary hover:text-primary/80"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload New Document</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
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
              </div>
            </DialogContent>
          </Dialog>
        </div>
    </AppLayout>
  );
}