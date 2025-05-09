import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { apiRequest } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/layouts/app-layout";
import { DataTable } from "@/components/ui/data-table";
import { Loading } from "@/components/ui/loading";
import { Error } from "@/components/ui/error";
import { ButtonLoading } from "@/components/ui/button-loading";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Form validation schemas
const companySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  registered_address: z.string().min(1, "Registered address is required"),
  postal_address: z.string().optional(),
  contact_person_name: z.string().min(1, "Contact person name is required"),
  contact_person_phone: z.string().min(1, "Contact person phone is required"),
  contact_person_email: z.string().email("Invalid email address"),
});

const segmentSchema = z.object({
  company_id: z.number(),
  segment_name: z.string().min(1, "Segment name is required"),
});

type CompanyFormValues = z.infer<typeof companySchema>;
type SegmentFormValues = z.infer<typeof segmentSchema>;

interface Company {
  company_id: number;
  company_name: string;
  registered_address: string;
  postal_address?: string;
  contact_person_name: string;
  contact_person_phone: string;
  contact_person_email: string;
  created_at?: string;
  created_by?: number;
}

interface CompanySegment {
  company_id: number;
  segment_id: number;
  company_name: string;
  segment_name: string;
  created_at?: string;
  created_by?: number;
}

export default function CompanyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("companies");
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [showSegmentDialog, setShowSegmentDialog] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingSegment, setEditingSegment] = useState<CompanySegment | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Fetch companies
  const { data: companies = [], isLoading: isLoadingCompanies, error: companiesError } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  // Fetch segments
  const { data: segments = [], isLoading: isLoadingSegments, error: segmentsError } = useQuery<CompanySegment[]>({
    queryKey: ["/api/company-segments"],
  });

  // Company form
  const companyForm = useForm<CompanyFormValues>({
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

  // Segment form
  const segmentForm = useForm<SegmentFormValues & { company_name: string }>({
    resolver: zodResolver(segmentSchema),
    defaultValues: {
      company_id: 0,
      segment_name: "",
      company_name: "",
    },
  });

  // Company columns
  const companyColumns: ColumnDef<Company>[] = [
    {
      accessorKey: "company_name",
      header: "Company Name",
    },
    {
      accessorKey: "contact_person_name",
      header: "Contact Person",
    },
    {
      accessorKey: "contact_person_email",
      header: "Email",
    },
    {
      accessorKey: "contact_person_phone",
      header: "Phone",
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCompany(row.original);
              setActiveTab("segments");
            }}
          >
            View Segments
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEditCompany(row.original)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  // Segment columns
  const segmentColumns: ColumnDef<CompanySegment>[] = [
    {
      accessorKey: "company_name",
      header: "Company Name",
    },
    {
      accessorKey: "segment_name",
      header: "Segment Name",
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditSegment(row.original)}
        >
          Edit
        </Button>
      ),
    },
  ];

  // Handle company edit
  const handleEditCompany = (company: Company) => {
    setEditingCompany(company);
    setShowCompanyDialog(true);
    companyForm.reset(company);
  };

  // Handle segment edit
  const handleEditSegment = (segment: CompanySegment) => {
    setEditingSegment(segment);
    setShowSegmentDialog(true);
    segmentForm.reset({
      company_id: segment.company_id,
      segment_name: segment.segment_name,
      company_name: segment.company_name,
    });
  };

  // Company mutation
  const companyMutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      if (editingCompany) {
        const response = await apiRequest(
          "PUT",
          `/api/companies/${editingCompany.company_id}`,
          data
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to update company");
        }
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/companies", data);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to create company");
        }
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setShowCompanyDialog(false);
      toast({
        title: editingCompany ? "Updated successfully" : "Created successfully",
        description: editingCompany
          ? "Company has been updated"
          : "New company has been created",
      });
      companyForm.reset();
      setEditingCompany(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Segment mutation
  const segmentMutation = useMutation({
    mutationFn: async (data: SegmentFormValues & { company_name: string }) => {
      if (editingSegment) {
        const response = await apiRequest(
          "PUT",
          `/api/company-segments/${editingSegment.company_id}/${editingSegment.segment_id}`,
          data
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to update segment");
        }
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/company-segments", data);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to create segment");
        }
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-segments"] });
      setShowSegmentDialog(false);
      toast({
        title: editingSegment ? "Updated successfully" : "Created successfully",
        description: editingSegment
          ? "Segment has been updated"
          : "New segment has been created",
      });
      segmentForm.reset();
      setEditingSegment(null);

      // Ensure the selectedCompany filter is refreshed
      if (selectedCompany) {
        const updatedSegments = queryClient.getQueryData<CompanySegment[]>("/api/company-segments") || [];
        const filteredSegments = updatedSegments.filter(
          (segment) => segment.company_id === selectedCompany.company_id
        );
        queryClient.setQueryData(["/api/company-segments", selectedCompany.company_id], filteredSegments);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (companiesError || segmentsError) {
    return (
      <AppLayout>
        <Error
          variant="card"
          fullPage
          title="Error Loading Data"
          message={(companiesError || segmentsError)?.message || "Failed to load data"}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="segments">Segments</TabsTrigger>
            </TabsList>
            {activeTab === "companies" ? (
              <Button
                onClick={() => {
                  setEditingCompany(null);
                  setShowCompanyDialog(true);
                  companyForm.reset();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setEditingSegment(null);
                  setShowSegmentDialog(true);
                  segmentForm.reset();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Segment
              </Button>
            )}
          </div>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle>Companies</CardTitle>
                <CardDescription>Manage your companies</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCompanies ? (
                  <Loading size="default" text="Loading companies..." center={false} />
                ) : (
                  <DataTable
                    columns={companyColumns}
                    data={companies}
                    searchKey="company_name"
                    searchPlaceholder="Search companies..."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="segments">
            <Card>
              <CardHeader>
                <CardTitle>Segments</CardTitle>
                <CardDescription>
                  {selectedCompany 
                    ? `Segments for ${selectedCompany.company_name}`
                    : "All company segments"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSegments ? (
                  <Loading size="default" text="Loading segments..." center={false} />
                ) : (
                  <DataTable
                    columns={segmentColumns}
                    data={selectedCompany 
                      ? segments.filter(s => s.company_id === selectedCompany.company_id)
                      : segments}
                    searchKey="segment_name"
                    searchPlaceholder="Search segments..."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Company Dialog */}
        <Dialog open={showCompanyDialog} onOpenChange={setShowCompanyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? "Edit Company" : "Add New Company"}
              </DialogTitle>
            </DialogHeader>
            <Form {...companyForm}>
              <form
                onSubmit={companyForm.handleSubmit((data) => companyMutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={companyForm.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter company name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={companyForm.control}
                  name="registered_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter registered address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={companyForm.control}
                  name="postal_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter postal address (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={companyForm.control}
                  name="contact_person_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter contact person name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={companyForm.control}
                  name="contact_person_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter contact person phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={companyForm.control}
                  name="contact_person_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter contact person email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCompanyDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={companyMutation.isPending}>
                    {companyMutation.isPending ? (
                      <ButtonLoading text={editingCompany ? "Updating..." : "Creating..."} />
                    ) : editingCompany ? (
                      "Update"
                    ) : (
                      "Create"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Segment Dialog */}
        <Dialog open={showSegmentDialog} onOpenChange={setShowSegmentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSegment ? "Edit Segment" : "Add New Segment"}
              </DialogTitle>
            </DialogHeader>
            <Form {...segmentForm}>
              <form
                onSubmit={segmentForm.handleSubmit((data) => {
                  const selectedCompanyName = companies.find(
                    (company) => company.company_id === data.company_id
                  )?.company_name;
                  segmentMutation.mutate({ ...data, company_name: selectedCompanyName || "" });
                })}
                className="space-y-4"
              >
                <FormField
                  control={segmentForm.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          value={field.value || ""}
                        >
                          <option value="">Select a company</option>
                          {companies.map((company) => (
                            <option key={company.company_id} value={company.company_id}>
                              {company.company_name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={segmentForm.control}
                  name="segment_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segment Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter segment name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSegmentDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={segmentMutation.isPending}>
                    {segmentMutation.isPending ? (
                      <ButtonLoading text={editingSegment ? "Updating..." : "Creating..."} />
                    ) : editingSegment ? (
                      "Update"
                    ) : (
                      "Create"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}