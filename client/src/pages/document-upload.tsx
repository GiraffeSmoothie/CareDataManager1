import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import AppLayout from "@/layouts/app-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Eye, ArrowDown, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { TokenStorage } from "@/lib/token-storage";
import { insertDocumentSchema, type PersonInfo, type Document } from "@shared/schema";
import { ErrorDisplay } from "@/components/ui/error-display";
import { useSegment } from "@/contexts/segment-context";
import { z } from "zod";

// Define the enhanced document schema
const documentFormSchema = insertDocumentSchema.extend({
  file: z.instanceof(FileList).optional().or(z.null()).refine(
    file => !file || file.length > 0, 
    {
      message: "Please select a file",
      path: ["file"]
    }
  )
});

/**
 * Helper function to view documents securely using the new viewing endpoint
 * @param filePath - The file path of the document to view
 */
const viewDocumentSecurely = async (filePath: string) => {
  try {
    // Use the new secure viewing endpoint that handles authentication
    const viewUrl = `/api/documents/view/${encodeURIComponent(filePath)}`;
    
    // Make the request through apiRequest to include authentication headers
    const response = await apiRequest('GET', viewUrl);
    
    // Create a blob URL for viewing
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Open in a new window
    window.open(blobUrl, '_blank');
    
    // Clean up the blob URL after a short delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (error) {
    console.error('Error viewing document:', error);
    // You could add a toast notification here if available
  }
};

/**
 * Helper function to download documents securely
 * @param filePath - The file path of the document to download
 * @param fileName - The suggested filename for download
 */
const downloadDocumentSecurely = async (filePath: string, fileName: string) => {
  try {
    // Use the existing download endpoint but with proper authentication
    const downloadUrl = `/api/documents/${encodeURIComponent(filePath)}`;
    
    // Make the request through apiRequest to include authentication headers
    const response = await apiRequest('GET', downloadUrl);
    
    // Create a blob URL for download
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Error downloading document:', error);
    // You could add a toast notification here if available
  }
};

// Define the type based on the schema
type DocumentFormData = z.infer<typeof documentFormSchema>;

// Document types for dropdown
const documentTypes = [
  "Identity Document",
  "Medical Record",
  "Legal Document",
  "Care Plan",
  "Assessment",
  "Sign Up Docs",
  "Other"
];

export default function DocumentUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedSegment } = useSegment();

  // Fetch all members filtered by the selected segment
  const { data: members = [], refetch: refetchMembers } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info", selectedSegment?.id],    queryFn: async () => {
      const url = selectedSegment 
        ? `/api/person-info?segmentId=${selectedSegment.id}` 
        : "/api/person-info";
      const response = await apiRequest("GET", url);
      return await response.json();
    },
    staleTime: 10000,
    enabled: !!selectedSegment
  });

  // Refetch when selected segment changes
  useEffect(() => {
    if (selectedSegment) {
      refetchMembers();
      setSelectedMember(null); // Reset selected member when segment changes
      setSearchTerm("");
    }
  }, [selectedSegment, refetchMembers]);

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
    };  }, []);

  // Form setup
  const form = useForm<DocumentFormData>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      clientId: 0,
      documentName: "",
      documentType: "",
      file: null
    },
  });
  // Initialize form when a member is selected
  useEffect(() => {
    if (selectedMember) {
      form.setValue("clientId", selectedMember.id);
    }
  }, [selectedMember, form]);
  // Fetch documents for selected member
  const { data: documents = { data: [] }, isLoading: loadingDocuments } = useQuery<{ data: Document[] }>({
    queryKey: ["/api/documents/client", selectedMember?.id, selectedSegment?.id],
    queryFn: async () => {
      if (!selectedMember) return { data: [] };
      
      const response = await apiRequest("GET", `/api/documents/client/${selectedMember.id}${selectedSegment ? `?segmentId=${selectedSegment.id}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!selectedMember,
  });
  const uploadMutation = useMutation({
    mutationFn: async (data: DocumentFormData) => {
      if (!data.file) {
        throw new Error("No file selected");
      }      const formData = new FormData();
      formData.append("clientId", data.clientId.toString());
      formData.append("documentName", data.documentName);
      formData.append("documentType", data.documentType);
      formData.append("file", data.file[0]);
      
      // Add segment ID if available
      if (selectedSegment) {
        formData.append("segmentId", selectedSegment.id.toString());
      }      const response = await apiRequest("POST", "/api/documents", formData, true);
      return await response.json();
    },
    onSuccess: () => {
      setError(null);
      toast({
        title: "Document uploaded",
        description: "The document has been successfully uploaded",
      });

      form.reset({
        clientId: selectedMember?.id || 0,
        documentName: "",
        documentType: "",
        file: null
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }

      // Force refresh documents list
      if (selectedMember) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/documents/client", selectedMember.id, selectedSegment?.id],
          exact: true,
        });
      }
      
      setShowDialog(false);
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  // Form submission handler
  const onSubmit = (data: DocumentFormData) => {
    if (!selectedMember) {
      toast({
        title: "Error",
        description: "Please select a member first",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedSegment) {
      toast({
        title: "Error",
        description: "Please select a segment from the dropdown in the top left corner",
        variant: "destructive",
      });
      return;    }
    
    uploadMutation.mutate(data);
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6 text-base font-sans">
        {error && (
          <ErrorDisplay
            variant="alert"
            title="Upload Error"
            message={error}
            className="mb-4"
          />
        )}
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <CardTitle>Client Documents</CardTitle>
                {selectedSegment && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Segment: {selectedSegment.segment_name}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowDialog(true)} 
                  disabled={!selectedMember || !selectedSegment}
                  title={!selectedSegment ? "Please select a segment from the dropdown in the top left corner" : !selectedMember ? "Please select a member first" : "Upload document"}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedSegment ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <p className="mb-4 text-muted-foreground">Please select a segment from the dropdown in the top left corner</p>
              </div>
            ) : (
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
                          form.setValue("clientId", client.id);
                        }}
                      >
                        {client.title ? client.title + " " : ""}
                        {client.firstName} {client.lastName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Documents List Section */}
        {selectedMember && (
          <Card className="max-w-5xl mx-auto mt-6">
            <CardHeader>
              <CardTitle>Documents for {selectedMember.firstName} {selectedMember.lastName}</CardTitle>
              <CardDescription>Total documents: {documents.data?.length || 0}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocuments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (!documents.data || documents.data.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  No documents found for this client. Click "Add New" to upload documents.
                </div>
              ) : (
                <Table>
                  <TableHeader>                    <TableRow>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow></TableHeader>                  <TableBody>
                    {documents.data?.map((doc: Document) => (
                      <TableRow key={doc.id}>
                        <TableCell>{doc.documentName}</TableCell>
                        <TableCell>{doc.documentType}</TableCell>
                        <TableCell>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewDocumentSecurely(doc.filePath || '')}
                              title="View Document"
                            >
                              <Eye className="h-4 w-4 text-blue-600" />
                            </Button>                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadDocumentSecurely(doc.filePath || '', doc.documentName || 'download')}
                              title="Download Document"
                              className="inline-flex items-center justify-center text-sm font-medium text-primary hover:text-primary/80"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
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
          <DialogContent className="max-w-2xl" aria-describedby="dialog-description">
            <DialogHeader>
              <DialogTitle>Upload New Document</DialogTitle>
              {selectedMember && selectedSegment && (
                <p id="dialog-description" className="text-sm text-muted-foreground">
                  Upload a document for {selectedMember.firstName} {selectedMember.lastName} in segment {selectedSegment.segment_name}
                </p>
              )}
            </DialogHeader>
            <div className="mt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="clientId"
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
                            type="file"                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                onChange(files);
                              }
                            }}
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