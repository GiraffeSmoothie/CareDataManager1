import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
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
import { Loader2, Users, Activity } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { SimpleBarChart } from "@/components/ui/chart";
import { DataTable } from "@/components/ui/data-table";
import { SERVICE_STATUSES, CLIENT_STATUSES, STATUS_STYLES, type ServiceStatus } from "@/lib/constants";
import { Loading } from "@/components/ui/loading";
import { Error } from "@/components/ui/error";

interface DashboardMember extends PersonInfo {
  clientService?: ClientService;
}

interface DashboardStatistics {
  totalClients: number;
  activeClients: number;
  hcpLevelStats: Record<string, number>;
  serviceStatusStats: Record<string, number>;
}

export default function Dashboard() {
  const [statistics, setStatistics] = useState<DashboardStatistics>({
    totalClients: 0,
    activeClients: 0,
    hcpLevelStats: {},
    serviceStatusStats: {},
  });

  // Queries
  const { data: persons = [], isLoading: isLoadingPersons, error: personsError } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: services = [], isLoading: isLoadingServices, error: servicesError } = useQuery<ClientService[]>({
    queryKey: ["/api/client-services"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Process data for display whenever persons or services change
  useEffect(() => {
    if (persons && services) {
      // Calculate total and active clients
      const activeCount = persons.filter(p => p.status === CLIENT_STATUSES.ACTIVE).length;

      // Calculate HCP level statistics including unassigned
      const hcpStats = persons.reduce((acc, person) => {
        const level = person.hcpLevel || 'Unassigned';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate service status statistics
      const serviceStats = services.reduce((acc, service) => {
        const status = service.status || SERVICE_STATUSES.PLANNED;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setStatistics({
        totalClients: persons.length,
        activeClients: activeCount,
        hcpLevelStats: hcpStats,
        serviceStatusStats: serviceStats,
      });
    }
  }, [persons, services]);

  // Prepare members data by combining persons and services
  const members: DashboardMember[] = persons.map(person => ({
    ...person,
    clientService: services.find(service => service.clientId === person.id),
  }));

  // Define columns for the DataTable
  const columns: ColumnDef<DashboardMember>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const client = row.original;
        return `${client.title} ${client.firstName} ${client.lastName}`;
      },
    },
    {
      accessorKey: "hcpLevel",
      header: "HCP Level",
      cell: ({ row }) => row.getValue("hcpLevel") ? `Level ${row.getValue("hcpLevel")}` : 'Unassigned',
    },
    {
      id: "hcpDates",
      header: "HCP Start Date - End Date",
      cell: ({ row }) => {
        const startDate = row.original.hcpStartDate;
        return startDate ? (
          <>
            {new Date(startDate).toLocaleDateString()}
            {startDate && ' - '}
            {startDate && new Date(startDate).toLocaleDateString()}
          </>
        ) : 'Not set';
      },
    },
    {
      id: "serviceDays",
      header: "Service Days",
      cell: ({ row }) => row.original.clientService?.serviceDays?.join(', ') || 'Not set',
    },
    {
      id: "serviceHours",
      header: "Service Hours",
      cell: ({ row }) => row.original.clientService?.serviceHours ? 
        `${row.original.clientService.serviceHours} hours` : 
        'Not set',
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.clientService?.status || SERVICE_STATUSES.PLANNED;
        return (
          <Badge className={STATUS_STYLES[status as ServiceStatus]}>
            {status}
          </Badge>
        );
      },
    },
  ];

  // Prepare chart data
  const hcpChartData = Object.entries(statistics.hcpLevelStats).map(([level, count]) => ({
    name: level === 'Unassigned' ? 'Unassigned' : `Level ${level}`,
    value: count
  }));

  const statusChartData = Object.entries(statistics.serviceStatusStats).map(([status, count]) => ({
    name: status,
    value: count
  }));

  if (isLoadingPersons || isLoadingServices) {
    return (
      <AppLayout>
        <Loading text="Loading dashboard data..." />
      </AppLayout>
    );
  }

  if (personsError || servicesError) {
    return (
      <AppLayout>
        <Error 
          variant="card"
          fullPage
          message={personsError?.message || servicesError?.message || "There was an error loading the dashboard data."}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-6">
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
              columns={columns}
              data={members.filter(m => m.status === 'Active')}
              searchKey="firstName"
              searchPlaceholder="Search clients..."
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}