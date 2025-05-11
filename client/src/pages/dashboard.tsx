import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonInfo, ClientService } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { Loader2, Users, Activity, Search } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { SimpleBarChart } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { STATUS_CONFIGS } from "@/lib/constants";
import { ErrorDisplay } from "@/components/ui/error-display";

type CombinedClientData = PersonInfo & { clientService?: ClientService };

export default function Dashboard() {
  const [combinedData, setCombinedData] = useState<Array<CombinedClientData>>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch person info data
  const {
    data: personData = [],
    isLoading: isLoadingPersons,
    error: personsError,
  } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch client services data
  const {
    data: clientServices = [],
    isLoading: isLoadingServices,
    error: servicesError,
  } = useQuery<ClientService[]>({
    queryKey: ["/api/client-services"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Combine data when both queries complete
  useEffect(() => {
    if (personData && clientServices) {
      const combinedData = personData.map(person => {
        const clientService = clientServices.find(cs => cs.clientId === person.id);
        return {
          ...person,
          clientService
        };
      });
      setCombinedData(combinedData);
    }
  }, [personData, clientServices]);

  // Filter members and calculate statistics
  const filteredMembers = combinedData
    .filter(member => member.clientService?.status !== 'Closed')
    .filter(member => 
      (member.firstName + " " + member.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.clientService?.status?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const activeMembers = filteredMembers.filter(member => 
    member.clientService?.status === 'In Progress'
  );

  const statistics = {
    totalClients: combinedData.length,
    activeClients: activeMembers.length,
    hcpLevelStats: combinedData.reduce((acc, member) => {
      const level = member.hcpLevel || 'Unassigned';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    serviceStatusStats: combinedData.reduce((acc, member) => {
      const status = member.clientService?.status || 'Not Assigned';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  // Prepare chart data
  const hcpChartData = Object.entries(statistics.hcpLevelStats).map(([level, count]) => ({
    name: level === 'Unassigned' ? 'Unassigned' : `Level ${level}`,
    value: count
  }));

  const statusChartData = Object.entries(statistics.serviceStatusStats).map(([status, count]) => ({
    name: status,
    value: count
  }));

  const columns: DataTableColumnDef<CombinedClientData>[] = [
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.title} {row.original.firstName} {row.original.lastName}
        </span>
      )
    },
    {
      accessorKey: "hcpLevel",
      header: "HCP Level",
      cell: ({ row }) => row.original.hcpLevel ? `Level ${row.original.hcpLevel}` : 'Unassigned'
    },
    {
      accessorKey: "hcpStartDate",
      header: "HCP Start Date - End Date",
      cell: ({ row }) => (
        <>
          {row.original.hcpStartDate ? new Date(row.original.hcpStartDate).toLocaleDateString() : 'Not set'}
          {row.original.hcpStartDate && ' - '}
          {row.original.hcpStartDate ? new Date(row.original.hcpStartDate).toLocaleDateString() : ''}
        </>
      )
    },
    {
      accessorKey: "clientService.serviceDays",
      header: "Service Days",
      cell: ({ row }) => row.original.clientService?.serviceDays?.join(', ') || 'Not set'
    },
    {
      accessorKey: "clientService.serviceHours",
      header: "Service Hours",
      cell: ({ row }) => row.original.clientService?.serviceHours ? `${row.original.clientService.serviceHours} hours` : 'Not set'
    },
    {
      accessorKey: "clientService.status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.clientService?.status || 'Not Assigned';
        const config = STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS] || STATUS_CONFIGS.Closed;
        return (
          <Badge 
            variant={config.badge}
            className={config.color}
          >
            {status}
          </Badge>
        );
      }
    }
  ];

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
          <ErrorDisplay 
            variant="card"
            title="Error Loading Dashboard"
            message={personsError?.message || servicesError?.message || "There was an error loading the dashboard data."}
            className="max-w-md"
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Client Dashboard</h1>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalClients}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.activeClients}</div>
            </CardContent>
          </Card>

          {/* Charts */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">HCP Level Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <SimpleBarChart data={hcpChartData} color="#2563eb" />
            </CardContent>
          </Card>
        </div>

        {/* Service Status Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Service Status Overview</CardTitle>
            <CardDescription>Distribution of client service statuses</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <SimpleBarChart data={statusChartData} color="#64748b" />
          </CardContent>
        </Card>

        {/* Active Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active Clients</CardTitle>
            <CardDescription>Clients with active services and their HCP details</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={filteredMembers}
              columns={columns}
              searchPlaceholder="Search active clients..."
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}