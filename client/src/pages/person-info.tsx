import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { insertPersonInfoSchema } from "@shared/schema";
import { apiRequest } from "../lib/queryClient";
import DashboardLayout from "../layouts/dashboard-layout";
import { useToast } from "../hooks/use-toast";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

// Define the document schema
const documentSchema = z.object({
  file: z.instanceof(FileList).optional(),
  documentName: z.string().min(2, "Document name is required").optional(),
  documentType: z.string().min(2, "Document type is required").optional(),
});

// Extend the schema with validation
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
  email: z.string()
    .email({ message: "Please enter a valid email address" }),
  contactNumber: z.string()
    .min(10, { message: "Contact number must be at least 10 digits" }),
  document: documentSchema.optional(),
});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

// Define document types
const documentTypes = [
  "Identification Document",
  "Medical Assessment",
  "Consent Form",
  "Proof of Address",
  "Insurance Information",
  "Birth Certificate",
  "Legal Power of Attorney",
  "Service Agreement",
  "Financial Record",
  "Other"
];

export default function PersonInfo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const form = useForm<PersonInfoFormValues>({
    resolver: zodResolver(personInfoSchema),
    defaultValues: {
      title: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      contactNumber: "",
      address: "",
    },
  });

  const documentMutation = useMutation({
    mutationFn: async ({ personInfo, file, documentName, documentType }: { 
      personInfo: PersonInfoFormValues, 
      file: File | null, 
      documentName: string, 
      documentType: string 
    }) => {
      const formData = new FormData();
      const personInfoResponse = await apiRequest("POST", "/api/person-info", personInfo);
      const personInfoResult = await personInfoResponse.json();
      
      if (file && documentName && documentType) {
        setUploading(true);
        formData.append("file", file);
        formData.append("documentName", documentName);
        formData.append("documentType", documentType);
        formData.append("memberId", personInfoResult.id.toString());
        
        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error("Failed to upload document");
        }
        
        setUploading(false);
        return { personInfo: personInfoResult, document: await response.json() };
      }
      
      return { personInfo: personInfoResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
      toast({
        title: "Success",
        description: "Personal information saved successfully",
      });
      form.reset();
      setFilePreview(null);
    },
    onError: (error: any) => {
      setUploading(false);
      toast({
        title: "Error",
        description: error.message || "Failed to save personal information",
        variant: "destructive",
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PersonInfoFormValues) => {
      const response = await apiRequest("POST", "/api/person-info", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
      toast({
        title: "Success",
        description: "Personal information saved successfully",
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save personal information",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const onSubmit = (data: PersonInfoFormValues) => {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0] || null;
    const documentName = form.watch("document.documentName") || "";
    const documentType = form.watch("document.documentType") || "";

    if (file && (!documentName || !documentType)) {
      toast({
        title: "Warning",
        description: "Please provide both document name and type for the uploaded file",
        variant: "destructive",
      });
      return;
    }

    if (file && documentName && documentType) {
      documentMutation.mutate({ 
        personInfo: data, 
        file, 
        documentName, 
        documentType 
      });
    } else {
      mutation.mutate(data);
    }
  };

  return (
    <DashboardLayout>
      <div className="container py-10">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Enter the personal details of the individual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
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

                <FormField
                  control={form.control}
                  name="contactNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter full address"
                          className="resize-none min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center">
                    <h3 className="text-lg font-medium">Upload Supporting Document (Optional)</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="document.documentName"
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
                      name="document.documentType"
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
                  </div>

                  <FormField
                    control={form.control}
                    name="document.file"
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Upload Document</FormLabel>
                        <FormControl>
                          <div className="grid gap-4">
                            <div className="flex items-center justify-center w-full">
                              <label 
                                htmlFor="dropzone-file" 
                                className={cn(
                                  "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-primary/5",
                                  filePreview ? "border-primary" : "border-border"
                                )}
                              >
                                {filePreview ? (
                                  <div className="flex flex-col items-center justify-center px-6 py-4">
                                    <CheckCircle2 className="w-8 h-8 text-primary mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                      File selected
                                    </p>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center px-6 py-4">
                                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                    <p className="text-sm text-center text-muted-foreground">
                                      <span className="font-medium">Click to upload</span> or drag and drop
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      PDF, DOC, DOCX, JPG, PNG (MAX. 10MB)
                                    </p>
                                  </div>
                                )}
                                <input 
                                  id="dropzone-file" 
                                  type="file" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    handleFileChange(e);
                                    onChange(e.target.files);
                                  }}
                                  {...fieldProps}
                                />
                              </label>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={mutation.isPending || documentMutation.isPending || uploading}
                >
                  {mutation.isPending || documentMutation.isPending || uploading ? (
                    <div className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : "Save Information"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}