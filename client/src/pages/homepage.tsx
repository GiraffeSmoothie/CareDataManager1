import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/app-layout"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { useLocation } from "wouter"
import { STATUS_CONFIGS } from '@/lib/constants';
import { useSegment } from "@/contexts/segment-context"
import { useEffect } from "react"
import { 
  Loader2, 
  Users, 
  Activity, 
  FileText, 
  Plus, 
  Clock,
  Heart,
  Calendar
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Helper function to properly format dates
const formatDate = (dateString: string): string => {
  if (!dateString) return "-";
  
  try {
    // Check if in DD-MM-YYYY format
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
      const [day, month, year] = dateString.split('-').map(Number);
      // Create date object (month is 0-indexed in JS)
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString();
    } 
    // Check if in ISO format
    else if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
      return new Date(dateString).toLocaleDateString();
    }
    // Fallback to displaying the raw string
    return dateString;
  } catch (error) {
    console.error("Error parsing date:", error);
    return dateString; // Return raw value if parsing fails
  }
};

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  status: string;
  hcpLevel?: string;
  hcpStartDate?: string;
}

export default function Homepage() {
  const [_, setLocation] = useLocation();
  const { selectedSegment, isLoading: segmentLoading } = useSegment();
  const queryClient = useQueryClient();

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["/api/person-info", selectedSegment?.id],
    queryFn: async () => {
      if (!selectedSegment) {
        return [];
      }
      
      console.log("Homepage: Fetching members for segment", selectedSegment.id);
      const response = await axios.get(`/api/person-info?segmentId=${selectedSegment.id}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // Filter for active members only
      const allMembers = response.data as Member[];
      const activeMembers = allMembers.filter(m => m.status === "Active" || m.status === "Paused" || m.status === "New");
      console.log("Homepage: Fetched", activeMembers.length, "active members");
      return activeMembers;
    },
    enabled: !!selectedSegment && !segmentLoading, // Only run query when we have a segment and segments have finished loading
    staleTime: 1000, // Shorter stale time for more immediate updates
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

  // Invalidate and refetch members data when segment changes
  useEffect(() => {
    if (selectedSegment && !segmentLoading) {
      console.log("Homepage: Segment changed to", selectedSegment.id, "invalidating queries");
      queryClient.invalidateQueries({ queryKey: ["/api/person-info"] });
    }
  }, [selectedSegment?.id, segmentLoading, queryClient]);

  const handleMemberClick = (member: Member) => {
    const memberName = `${member.firstName} ${member.lastName}`;
    setLocation(`/client-assignment?clientId=${member.id}&name=${encodeURIComponent(memberName)}`);
  };

  // Sort members by status order from centralized config
  const sortedMembers = members?.sort((a, b) => {
    const getOrder = (status: string) => STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS]?.order ?? 999;
    return getOrder(a.status) - getOrder(b.status);
  });

  // Calculate statistics
  const stats = {
    total: members?.length || 0,
    active: members?.filter(m => m.status === "Active").length || 0,
    paused: members?.filter(m => m.status === "Paused").length || 0,
    new: members?.filter(m => m.status === "New").length || 0,
    withHcp: members?.filter(m => m.hcpLevel && m.hcpLevel !== "-").length || 0
  };

  const isLoading = segmentLoading || membersLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header with Welcome Message */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>            <p className="text-muted-foreground">
              {selectedSegment ? `Welcome to ${selectedSegment.segment_name} segment` : "Please select a segment to get started"}
            </p>
          </div>
          {selectedSegment && (
            <div className="flex gap-2">
              <Button onClick={() => setLocation('/manage-client')} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
              <Button variant="outline" onClick={() => setLocation('/client-assignment')} className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                View All
              </Button>
            </div>
          )}
        </div>

        {!selectedSegment ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Segment Selected</h3>
            <p className="text-muted-foreground max-w-md">
              Please select a segment from the dropdown in the header to view your client dashboard and statistics.
            </p>
          </div>
        ) : (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Clients
                  </CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">
                    Active members in segment
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Active Clients
                  </CardTitle>
                  <Activity className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.active}</div>
                  <p className="text-xs text-muted-foreground">
                    Currently active
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Paused Clients
                  </CardTitle>
                  <Clock className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.paused}</div>
                  <p className="text-xs text-muted-foreground">
                    Temporarily paused
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    HCP Enrolled
                  </CardTitle>
                  <Heart className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.withHcp}</div>
                  <p className="text-xs text-muted-foreground">
                    Health care programs
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Clients Section */}
            {sortedMembers && sortedMembers.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Recent Clients
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Latest client activity and status updates
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => setLocation('/client-assignment')}>
                      View All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedMembers.slice(0, 6).map((member) => (
                      <Card 
                        key={member.id} 
                        className="p-4 cursor-pointer hover:shadow-md transition-all duration-200 border-l-4 hover:border-l-primary"
                        onClick={() => handleMemberClick(member)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-base leading-tight">
                              {member.firstName} {member.lastName}
                            </h3>
                            <p className="text-xs text-muted-foreground">ID: {member.id}</p>
                          </div>
                          <Badge variant={member.status === "Active" ? "default" : member.status === "Paused" ? "secondary" : "outline"}>
                            {member.status}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Heart className="h-3 w-3" />
                            <span>HCP Level: {member.hcpLevel || "Not assigned"}</span>
                          </div>
                          {member.hcpStartDate && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>Started: {formatDate(member.hcpStartDate)}</span>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                  
                  {sortedMembers.length > 6 && (
                    <div className="mt-4 text-center">
                      <Button variant="outline" onClick={() => setLocation('/client-assignment')}>
                        View {sortedMembers.length - 6} More Clients
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Clients Found</h3>
                  <p className="text-muted-foreground max-w-md mb-4">
                    No active clients found for the selected segment. Start by adding your first client.
                  </p>
                  <Button onClick={() => setLocation('/manage-client')} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add First Client
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}