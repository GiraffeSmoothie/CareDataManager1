import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonInfo, MemberService } from "@shared/schema";
import { getQueryFn } from "@/lib/queryClient";
import { Loader2, Users, Activity, Search } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { SimpleBarChart } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";

export default function Dashboard() {
  const [combinedData, setCombinedData] = useState<Array<PersonInfo & { memberService?: MemberService }>>([]);
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

  // Fetch member services data
  const {
    data: memberServices = [],
    isLoading: isLoadingServices,
    error: servicesError,
  } = useQuery<MemberService[]>({
    queryKey: ["/api/member-services"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Combine data when both queries complete
  useEffect(() => {
    if (personData && memberServices) {
      const combinedData = personData.map(person => {
        const memberService = memberServices.find(ms => ms.memberId === person.id);
        return {
          ...person,
          memberService
        };
      });
      setCombinedData(combinedData);
    }
  }, [personData, memberServices]);

  // Filter members and calculate statistics
  const filteredMembers = combinedData
    .filter(member => member.memberService?.status !== 'Closed')
    .filter(member => 
      (member.firstName + " " + member.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.memberService?.status?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const activeMembers = filteredMembers.filter(member => 
    member.memberService?.status === 'In Progress'
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
      const status = member.memberService?.status || 'Not Assigned';
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

        {/* Active Members Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active Members</CardTitle>
            <CardDescription>Members with active services and their HCP details</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>HCP Level</TableHead>
                  <TableHead>HCP End Date</TableHead>
                  <TableHead>Service Days</TableHead>
                  <TableHead>Service Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => (
                    <TableRow 
                      key={member.id} 
                      className="cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        window.location.href = `/member-assignment?memberId=${member.id}&name=${encodeURIComponent(`${member.firstName} ${member.lastName}`)}`;
                      }}
                    >
                      <TableCell className="font-medium">
                        {member.title} {member.firstName} {member.lastName}
                      </TableCell>
                      <TableCell>
                        {member.hcpLevel ? `Level ${member.hcpLevel}` : 'Unassigned'}
                      </TableCell>
                      <TableCell>
                        {member.hcpEndDate ? new Date(member.hcpEndDate).toLocaleDateString() : 'Not set'}
                      </TableCell>
                      <TableCell>
                        {member.memberService?.serviceDays?.join(', ') || 'Not set'}
                      </TableCell>
                      <TableCell>
                        {member.memberService?.serviceHours || 'Not set'} hours
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={member.memberService?.status === 'In Progress' ? 'default' : 'secondary'}
                          className={member.memberService?.status === 'In Progress' ? 'bg-green-100 text-green-800' : ''}
                        >
                          {member.memberService?.status || 'Not Assigned'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No members found matching your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}