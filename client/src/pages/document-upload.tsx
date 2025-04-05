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
import { Loader2, Upload, FileText, CheckCircle2, File, ArrowDown } from "lucide-react";
import type { Document, PersonInfo } from "@shared/schema";

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
  }).min(2, {
    message: "Document type must be at least 2 characters"
  }),
  file: z.instanceof(FileList).refine((files) => files.length > 0, {
    message: "Please upload a file"
  })
});

type DocumentFormValues = z.infer<typeof documentFormSchema>;

// Define document types
const documentTypes = [
  "Medical Assessment",
  "Care Plan",
  "Consent Form",
  "Referral Letter",
  "Progress Report",
  "Service Agreement",
  "Identification Document",
  "Financial Record",
  "Support Letter",
  "Other"
];

export default function DocumentUpload() {
  const { toast } = useToast();
  const [selectedMember, setSelectedMember] = useState<string | undefined>();
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch all members
  const { data: members = [], isLoading: loadingMembers } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    staleTime: 10000,
  });

  // Fetch documents for selected member
  const { data: documents = [], isLoading: loadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents/member", selectedMember],
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

  // Handle file change for preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      // Show preview for image files only
      if (fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
        const reader = new FileReader();
        reader.onload = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  // Reset form when member changes
  useEffect(() => {
    form.setValue("memberId", selectedMember || "");
  }, [selectedMember, form]);

  // Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: DocumentFormValues) => {
      setUploading(true);
      const formData = new FormData();
      formData.append("memberId", data.memberId);
      formData.append("documentName", data.documentName);
      formData.append("documentType", data.documentType);
      
      // Append file
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
      
      // Reset form
      form.reset({
        memberId: selectedMember || "",
        documentName: "",
        documentType: "",
      });
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
      
      // Reset file preview
      setFilePreview(null);
      
      // Invalidate queries
      if (selectedMember) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents/member", selectedMember] });
      }
      
      setUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error uploading document",
        description: error.message,
        variant: "destructive",
      });
      setUploading(false);
    },
  });

  // Form submission handler
  const onSubmit = (data: DocumentFormValues) => {
    uploadMutation.mutate(data);
  };

  // Get file icon based on extension
  const getFileIcon = useCallback((filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (ext === 'doc' || ext === 'docx') return <FileText className="h-5 w-5 text-blue-500" />;
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return <FileText className="h-5 w-5 text-green-500" />;
    
    return <File className="h-5 w-5 text-gray-500" />;
  }, []);

  // Format date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Document Upload</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Member selection */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Select Member</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Select a member to upload documents for:
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className={`p-3 rounded-md cursor-pointer transition-colors ${
                          selectedMember === member.id.toString()
                            ? "bg-primary text-primary-foreground"
                            : "bg-card hover:bg-accent"
                        }`}
                        onClick={() => setSelectedMember(member.id.toString())}
                      >
                        <div className="font-medium">
                          {member.title} {member.firstName} {member.lastName}
                        </div>
                        <div className="text-sm opacity-90">{member.email}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Middle column - Upload form */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMember ? (
                <div className="text-center p-6 text-muted-foreground">
                  Please select a member first
                </div>
              ) : (
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
                            <div className="flex flex-col items-center justify-center w-full">
                              <label
                                htmlFor="dropzone-file"
                                className={`flex flex-col items-center justify-center w-full h-40 
                                  border-2 border-dashed rounded-lg cursor-pointer 
                                  ${filePreview ? 'border-primary bg-muted/20' : 'border-muted-foreground/30 hover:border-muted-foreground/50'}`}
                              >
                                {filePreview ? (
                                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <CheckCircle2 className="w-8 h-8 mb-2 text-primary" />
                                    <p className="text-sm text-muted-foreground">File selected</p>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                    <p className="mb-2 text-sm text-muted-foreground">
                                      <span className="font-semibold">Click to upload</span> or drag and drop
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      PDF, DOC, DOCX, JPG, JPEG, PNG (MAX 5MB)
                                    </p>
                                  </div>
                                )}
                                <input
                                  id="dropzone-file"
                                  type="file"
                                  className="hidden"
                                  {...field}
                                  onChange={(e) => {
                                    onChange(e.target.files);
                                    handleFileChange(e);
                                  }}
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                />
                              </label>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button type="submit" className="w-full" disabled={uploading}>
                      {uploading ? (
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
              )}
            </CardContent>
          </Card>
          
          {/* Right column - Document list */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMember ? (
                <div className="text-center p-6 text-muted-foreground">
                  Select a member to view their documents
                </div>
              ) : loadingDocuments ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center p-6 text-muted-foreground">
                  No documents found for this member
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-start space-x-3 p-3 rounded-lg border bg-card">
                      <div className="flex-shrink-0">
                        {getFileIcon(doc.filename)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {doc.documentName}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {doc.documentType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {doc.uploadedAt && formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <a
                          href={`/api/documents/${doc.filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none h-8 w-8 p-0 text-primary hover:bg-muted"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}