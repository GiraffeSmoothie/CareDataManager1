import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { insertPersonInfoSchema, type PersonInfo, type MemberService } from "@shared/schema";
import { getQueryFn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SimpleBarChart } from "@/components/ui/chart";
import { Loader2, Users, Activity, FileText, Plus, Clock, Search, CalendarIcon } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Form schema and types
const personInfoSchema = z.object({
  title: z.string(),
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string(),
  email: z.string().email().optional().or(z.literal("")),
  homePhone: z.string().optional(),
  mobilePhone: z.string().optional(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  postCode: z.string(),
  mailingAddressLine1: z.string().optional(),
  mailingAddressLine2: z.string().optional(),
  mailingAddressLine3: z.string().optional(),
  mailingPostCode: z.string().optional(),
  useHomeAddress: z.boolean().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinAddress: z.string().optional(),
  nextOfKinEmail: z.string().email().optional().or(z.literal("")),
  nextOfKinPhone: z.string().optional(),
  hcpLevel: z.string().optional(),
  hcpEndDate: z.string().optional(),
  status: z.string(),
});

type PersonInfoFormValues = z.infer<typeof personInfoSchema>;

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [useHomeAddress, setUseHomeAddress] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Add client");
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PersonInfo | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: persons, isLoading: isLoadingPersons, error: personsError } = useQuery<PersonInfo[]>({
    queryKey: ["persons"],
    queryFn: getQueryFn("/api/persons"),
  });

  const { data: services, isLoading: isLoadingServices, error: servicesError } = useQuery<MemberService[]>({
    queryKey: ["services"],
    queryFn: getQueryFn("/api/services"),
  });

  const form = useForm<PersonInfoFormValues>({
    resolver: zodResolver(personInfoSchema),
    defaultValues: {
      title: "",
      firstName: "",
      middleName: "",
      lastName: "",
      dateOfBirth: "",
      email: "",
      homePhone: "",
      mobilePhone: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      postCode: "",
      mailingAddressLine1: "",
      mailingAddressLine2: "",
      mailingAddressLine3: "",
      mailingPostCode: "",
      useHomeAddress: true,
      nextOfKinName: "",
      nextOfKinAddress: "",
      nextOfKinEmail: "",
      nextOfKinPhone: "",
      hcpLevel: "",
      hcpEndDate: "",
      status: "Created",
    },
  });

  if (isLoadingPersons || isLoadingServices) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (personsError || servicesError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Data</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{personsError?.message || servicesError?.message || "There was an error loading the dashboard data."}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const activeClients = persons?.filter(p => p.status === "Active") || [];
  const totalDocuments = services?.reduce((acc, service) => acc + (service.documents?.length || 0), 0) || 0;
  const recentServices = services?.slice(0, 5) || [];

  const filteredClients = persons?.filter(client => 
    searchTerm.length === 0 || 
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleEdit = (client: PersonInfo) => {
    setSelectedMember(client);
    setIsEditing(true);
    setButtonLabel("Update client");
    setShowDialog(true);

    Object.entries(client).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdBy') {
        form.setValue(key as any, value || "");
      }
    });
  };

  const handleAddNew = () => {
    setSelectedMember(null);
    setIsEditing(false);
    setButtonLabel("Add client");
    setShowDialog(true);
    form.reset();
  };

  return (
    <AppLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="container mx-auto p-4 space-y-8">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="clients">Client Management</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-8">
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 rounded-lg">
            <h1 className="text-4xl font-bold tracking-tight mb-4">Welcome to Care System</h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Manage your healthcare services efficiently and keep track of client information all in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/person-info">
              <Button className="w-full h-24 flex flex-col items-center justify-center space-y-2" variant="outline">
                <Plus className="h-6 w-6" />
                <span>New Client</span>
              </Button>
            </Link>
            <Link href="/document-upload">
              <Button className="w-full h-24 flex flex-col items-center justify-center space-y-2" variant="outline">
                <FileText className="h-6 w-6" />
                <span>Upload Document</span>
              </Button>
            </Link>
            <Link href="/member-assignment">
              <Button className="w-full h-24 flex flex-col items-center justify-center space-y-2" variant="outline">
                <Users className="h-6 w-6" />
                <span>Assign Members</span>
              </Button>
            </Link>
            <Link href="/master-data">
              <Button className="w-full h-24 flex flex-col items-center justify-center space-y-2" variant="outline">
                <Activity className="h-6 w-6" />
                <span>Service Data</span>
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{persons?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeClients.length} active clients
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Services</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{services?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across all clients
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalDocuments}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Uploaded and processed
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>HCP Level Distribution</CardTitle>
                <CardDescription>Distribution of clients across HCP levels</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <SimpleBarChart
                  data={
                    persons
                      ? Object.entries(
                          persons.reduce((acc, person) => {
                            const level = person.hcpLevel || 'Unassigned';
                            acc[level] = (acc[level] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([level, count]) => ({
                          name: level === 'Unassigned' ? 'Unassigned' : `Level ${level}`,
                          value: count,
                        }))
                      : []
                  }
                  color="#2563eb"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Services</CardTitle>
                <CardDescription>Latest service assignments and updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentServices.map((service, index) => (
                    <div key={index} className="flex items-start space-x-4 border-b last:border-0 pb-4">
                      <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">{service.serviceName}</p>
                        <p className="text-sm text-muted-foreground">
                          Assigned to client #{service.memberId}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentServices.length === 0 && (
                    <p className="text-muted-foreground text-sm">No recent services</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-[300px]"
                />
                <Search className="text-muted-foreground" />
              </div>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add New Client
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Client List</CardTitle>
                <CardDescription>Manage and view all clients</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date of Birth</TableHead>
                      <TableHead>HCP Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          {client.title} {client.firstName} {client.lastName}
                        </TableCell>
                        <TableCell>{client.dateOfBirth}</TableCell>
                        <TableCell>{client.hcpLevel || 'Unassigned'}</TableCell>
                        <TableCell>{client.status}</TableCell>
                        <TableCell>
                          <Button variant="ghost" onClick={() => handleEdit(client)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              </DialogHeader>
              {/* Add your form fields here similar to manage-client.tsx */}
              {/* ... */}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}