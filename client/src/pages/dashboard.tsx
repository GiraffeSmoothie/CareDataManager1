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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonInfo, MasterData } from "@shared/schema";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/layouts/dashboard-layout";

export default function Dashboard() {
  const [combinedData, setCombinedData] = useState<Array<PersonInfo & { careDetails?: MasterData }>>([]);

  // Fetch person info data
  const {
    data: personData = [],
    isLoading: isLoadingPersons,
    error: personsError,
  } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch master data
  const {
    data: masterData = [],
    isLoading: isLoadingMaster,
    error: masterError,
  } = useQuery<MasterData[]>({
    queryKey: ["/api/master-data"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Combine data when both queries complete
  useEffect(() => {
    if (personData && masterData) {
      const combinedData = personData.map(person => {
        // Find matching master data for this person
        const careDetails = masterData.find(md => md.memberId === person.id);
        
        return {
          ...person,
          careDetails
        };
      });
      
      setCombinedData(combinedData);
    }
  }, [personData, masterData]);

  // Handle loading state
  if (isLoadingPersons || isLoadingMaster) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Handle error state
  if (personsError || masterError) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Data</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                {personsError?.message || masterError?.message || "There was an error loading the dashboard data."}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Client Dashboard</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Total Clients</CardTitle>
              <CardDescription>Number of registered clients</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{personData?.length || 0}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Active Care Services</CardTitle>
              <CardDescription>Types of care being provided</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{masterData?.filter(item => item.active).length || 0}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Service Categories</CardTitle>
              <CardDescription>Distinct care categories</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {new Set(masterData?.map(item => item.serviceCategory) || []).size}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Member Table */}
        <Card>
          <CardHeader>
            <CardTitle>Client Details</CardTitle>
            <CardDescription>Overview of all registered clients and their care services</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>A list of all members and their assigned care services.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>Service Category</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combinedData.length > 0 ? (
                  combinedData.map((member) => (
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
                        <div className="flex flex-col">
                          <span>{member.email}</span>
                          <span className="text-muted-foreground">{member.mobilePhone}</span>
                        </div>
                      </TableCell>
                      <TableCell>{new Date(member.dateOfBirth).toLocaleDateString()}</TableCell>
                      <TableCell>{member.careDetails?.serviceCategory || 'Not assigned'}</TableCell>
                      <TableCell>{member.careDetails?.serviceType || 'Not assigned'}</TableCell>
                      <TableCell>
                        {member.careDetails?.active ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No client data available yet. Add clients through the Add Client page.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}