import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Search } from "lucide-react";
import { apiRequest } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/layouts/dashboard-layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// Form validation schema
const companySegmentSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  segment_name: z.string().min(1, "Segment name is required"),
});

type CompanySegmentFormValues = z.infer<typeof companySegmentSchema>;

interface CompanySegment {
  company_id: number;
  segment_id: number;
  company_name: string;
  segment_name: string;
  created_at?: string;
  created_by?: number;
}

export default function CompanySegmentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<CompanySegment | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch all company segments
  const { data: segments = [], isLoading } = useQuery<CompanySegment[]>({
    queryKey: ["/api/company-segments"],
  });

  // Initialize form
  const form = useForm<CompanySegmentFormValues>({
    resolver: zodResolver(companySegmentSchema),
    defaultValues: {
      company_name: "",
      segment_name: "",
    },
  });

  // Filter segments based on search term
  const filteredSegments = segments.filter(segment =>
    searchTerm.length === 0 ||
    segment.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    segment.segment_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle add new
  const handleAddNew = () => {
    setSelectedSegment(null);
    setIsEditing(false);
    setShowDialog(true);
    form.reset();
  };

  // Handle edit
  const handleEdit = (segment: CompanySegment) => {
    setSelectedSegment(segment);
    setIsEditing(true);
    setShowDialog(true);
    form.reset({
      company_name: segment.company_name,
      segment_name: segment.segment_name,
    });
  };

  // Save mutation
  const mutation = useMutation({
    mutationFn: async (data: CompanySegmentFormValues) => {
      if (!isEditing) {
        const response = await apiRequest("POST", "/api/company-segments", data);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to create company segment");
        }
        return response.json();
      } else if (selectedSegment) {
        const response = await apiRequest(
          "PUT",
          `/api/company-segments/${selectedSegment.company_id}/${selectedSegment.segment_id}`,
          data
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Failed to update company segment");
        }
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-segments"] });
      setShowDialog(false);
      toast({
        title: isEditing ? "Updated successfully" : "Created successfully",
        description: isEditing
          ? "Company segment has been updated"
          : "New company segment has been created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="container py-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Company Segments</CardTitle>
              <div className="flex gap-2">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search segments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Segment Name</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSegments.map((segment) => (
                    <TableRow key={`${segment.company_id}-${segment.segment_id}`}>
                      <TableCell>{segment.company_name}</TableCell>
                      <TableCell>{segment.segment_name}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(segment)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Edit Company Segment" : "Add New Company Segment"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
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
                  control={form.control}
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
                  ) : isEditing ? (
                    "Update Segment"
                  ) : (
                    "Create Segment"
                  )}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}