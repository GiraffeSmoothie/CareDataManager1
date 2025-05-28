import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DataTable } from "@/components/ui/data-table";
import { ErrorDisplay } from "@/components/ui/error-display";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Company, Segment } from "@shared/schema";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";

// Define the company schema
const companySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  registered_address: z.string().min(1, "Registered address is required"),
  postal_address: z.string().min(1, "Postal address is required"),
  contact_person_name: z.string().min(1, "Contact person name is required"),
  contact_person_phone: z.string()
    .min(1, "Contact person phone is required")
    .regex(/^\d{10}$/, "Phone number must be exactly 10 digits without any symbols"),
  contact_person_email: z.string().email("Invalid email address"),
});

// Define the segment schema
const segmentSchema = z.object({
  segment_name: z.string().min(1, "Segment name is required"),
});

type CompanyFormValues = z.infer<typeof companySchema>;
type SegmentFormValues = z.infer<typeof segmentSchema>;

export default function CompanyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // State for segments functionality
  const [expandedCompany, setExpandedCompany] = useState<number | null>(null);
  const [showSegmentDialog, setShowSegmentDialog] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [isEditingSegment, setIsEditingSegment] = useState(false);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      company_name: "",
      registered_address: "",
      postal_address: "",
      contact_person_name: "",
      contact_person_phone: "",
      contact_person_email: "",
    },
  });

  const segmentForm = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentSchema),
    defaultValues: {
      segment_name: "",
    },
  });

  // Fetch companies
  const { data: companies, isLoading, error: fetchError } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/companies");
      return response.json();
    },
  });
    // Fetch segments for a company
  const { data: segments, isLoading: isLoadingSegments, error: segmentsError } = useQuery<Segment[]>({
    queryKey: ["segments", expandedCompany],
    queryFn: async () => {
      if (!expandedCompany) return [];
      console.log("Fetching segments for company:", expandedCompany);
      const response = await apiRequest("GET", `/api/segments/${expandedCompany}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch segments");
      }
      return response.json();
    },
    enabled: !!expandedCompany,
  });

  if (fetchError) {
    return (
      <AppLayout>
        <ErrorDisplay 
          variant="card"
          title="Error Loading Companies"
          message={fetchError instanceof Error ? fetchError.message : "Failed to load companies"}
        />
      </AppLayout>
    );
  }

  // Add/Update company mutation
  const mutation = useMutation({
    mutationFn: (data: CompanyFormValues) => {
      if (isEditing && selectedCompany) {
        return apiRequest("PUT", `/api/companies/${selectedCompany.company_id}`, data);
      }
      return apiRequest("POST", "/api/companies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setShowDialog(false);
      form.reset();
      setSelectedCompany(null);
      setIsEditing(false);
      toast({
        title: "Success",
        description: `Company ${isEditing ? "updated" : "created"} successfully`,
      });
    },
    onError: (err: any) => {
      setError(err instanceof Error ? err : new Error(err.message || `Failed to ${isEditing ? "update" : "create"} company`));
    },
  });
  
  // Add/Update segment mutation
  const segmentMutation = useMutation({
    mutationFn: (data: { segment_name: string; company_id: number }) => {
      if (isEditingSegment && selectedSegment) {
        return apiRequest("PUT", `/api/segments/${selectedSegment.id}`, { segment_name: data.segment_name });
      }
      return apiRequest("POST", "/api/segments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments", expandedCompany] });
      setShowSegmentDialog(false);
      segmentForm.reset();
      setSelectedSegment(null);
      setIsEditingSegment(false);
      toast({
        title: "Success",
        description: `Segment ${isEditingSegment ? "updated" : "created"} successfully`,
      });
    },
    onError: (err: any) => {
      setError(err instanceof Error ? err : new Error(err.message || `Failed to ${isEditingSegment ? "update" : "create"} segment`));
    },
  });

  const handleEdit = (company: Company) => {
    setSelectedCompany(company);
    setIsEditing(true);
    form.reset({
      company_name: company.company_name,
      registered_address: company.registered_address,
      postal_address: company.postal_address,
      contact_person_name: company.contact_person_name,
      contact_person_phone: company.contact_person_phone,
      contact_person_email: company.contact_person_email,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedCompany(null);
    setIsEditing(false);
    form.reset();
  };

  const handleAddNew = () => {
    setIsEditing(false);
    setSelectedCompany(null);
    form.reset({
      company_name: "",
      registered_address: "",
      postal_address: "",
      contact_person_name: "",
      contact_person_phone: "",
      contact_person_email: "",
    });
    setShowDialog(true);
  };

  const handleToggleSegments = (companyId: number) => {
    if (expandedCompany === companyId) {
      setExpandedCompany(null);
    } else {
      setExpandedCompany(companyId);
    }
  };

  const handleAddNewSegment = (companyId: number) => {
    setSelectedSegment(null);
    setIsEditingSegment(false);
    segmentForm.reset({
      segment_name: "",
    });
    setExpandedCompany(companyId);
    setShowSegmentDialog(true);
  };
  
  const handleEditSegment = (segment: Segment) => {
    setSelectedSegment(segment);
    setIsEditingSegment(true);
    segmentForm.reset({
      segment_name: segment.segment_name,
    });
    setShowSegmentDialog(true);
  };

  const handleCloseSegmentDialog = () => {
    setShowSegmentDialog(false);
    setSelectedSegment(null);
    setIsEditingSegment(false);
    segmentForm.reset();
  };

  const columns = [
    {
      accessorKey: "company_name",
      header: "Company Name",
    },
    {
      accessorKey: "contact_person_name",
      header: "Contact Person",
    },
    {
      accessorKey: "contact_person_phone",
      header: "Phone",
    },
    {
      accessorKey: "contact_person_email",
      header: "Email",
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleEdit(row.original)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleToggleSegments(row.original.company_id)}>
            {expandedCompany === row.original.company_id ? 
              <ChevronUp className="h-4 w-4 mr-1" /> : 
              <ChevronDown className="h-4 w-4 mr-1" />
            }
            Segments
          </Button>
        </div>
      ),
    },
  ];
  
  const segmentColumns = [
    {
      accessorKey: "segment_name",
      header: "Segment Name",
    },
    {
      id: "actions",
      cell: ({ row }: any) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleEditSegment(row.original)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="container py-6">
        {error && (
          <ErrorDisplay 
            variant="alert"
            title="Error"
            message={error.message}
            className="mb-4"
            onDismiss={() => setError(null)}
          />
        )}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Companies</CardTitle>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <DataTable
                  data={companies || []}
                  columns={columns}
                  searchPlaceholder="Search companies..."
                />
                {companies?.map((company) => (
                  <Collapsible
                    key={company.company_id}
                    open={expandedCompany === company.company_id}
                    className={expandedCompany === company.company_id ? "border rounded-lg p-4 mt-4" : "hidden"}
                  >
                    <CollapsibleContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-medium">Segments for {company.company_name}</h3>
                          <Button size="sm" onClick={() => handleAddNewSegment(company.company_id)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Segment
                          </Button>
                        </div>                        {isLoadingSegments ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : segmentsError ? (
                          <div className="text-center py-4 text-red-600">
                            Error loading segments: {segmentsError instanceof Error ? segmentsError.message : "Unknown error"}
                          </div>
                        ) : segments && segments.length > 0 ? (
                          <DataTable
                            data={segments}
                            columns={segmentColumns}
                            searchPlaceholder="Search segments..."
                          />
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            No segments found. Add a segment to get started.
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Dialog */}
        <Dialog 
          open={showDialog} 
          onOpenChange={handleCloseDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Edit Company' : 'Add New Company'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registered_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postal_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="contact_person_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Phone</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="tel" 
                          maxLength={10}
                          pattern="[0-9]{10}"
                          onKeyDown={(e) => {
                            // Allow only numeric input, backspace, delete, tab, arrows
                            const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
                            if (!/[0-9]/.test(e.key) && !allowedKeys.includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => {
                            // Strip any non-numeric characters on paste or input
                            const value = e.target.value.replace(/[^0-9]/g, '');
                            e.target.value = value;
                            field.onChange(value);
                          }}
                          placeholder="10-digit phone number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_person_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <div className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    isEditing ? "Update Company" : "Create Company"
                  )}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Segment Dialog */}
        <Dialog 
          open={showSegmentDialog} 
          onOpenChange={handleCloseSegmentDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEditingSegment ? 'Edit Segment' : 'Add New Segment'}
              </DialogTitle>
            </DialogHeader>
            <Form {...segmentForm}>
              <form 
                onSubmit={segmentForm.handleSubmit((data) => {
                  segmentMutation.mutate({
                    segment_name: data.segment_name,
                    company_id: selectedSegment?.company_id || expandedCompany as number
                  });
                })} 
                className="space-y-4"
              >
                <FormField
                  control={segmentForm.control}
                  name="segment_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segment Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Home Care, Aged Care" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={segmentMutation.isPending}
                >
                  {segmentMutation.isPending ? (
                    <div className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    isEditingSegment ? "Update Segment" : "Create Segment"
                  )}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}