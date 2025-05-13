import { Card } from "@/components/ui/card"
import AppLayout from "@/layouts/app-layout"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useLocation } from "wouter"
import { STATUS_CONFIGS, getStatusBadgeColors } from '@/lib/constants';
import { useSegment } from "@/contexts/segment-context"
import { Loader2 } from "lucide-react"

interface Member {
  id: number
  firstName: string
  lastName: string
  status: string
  hcpLevel?: string
  hcpEndDate?: string
  hcpStartDate?: string
}

export default function Homepage() {
  const [_, setLocation] = useLocation();
  const { selectedSegment } = useSegment();

  const { data: members, isLoading } = useQuery({
    queryKey: ["/api/person-info", selectedSegment?.id],
    queryFn: async () => {
      if (!selectedSegment) {
        return [];
      }
      
      const response = await axios.get(`/api/person-info?segmentId=${selectedSegment.id}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // Filter for active members only
      return (response.data as Member[]).filter(m => m.status === "Active" || m.status === "Paused" || m.status === "New");
    },
    enabled: !!selectedSegment, // Only run query when a segment is selected
  });

  const handleMemberClick = (member: Member) => {
    const memberName = `${member.firstName} ${member.lastName}`;
    setLocation(`/client-assignment?clientId=${member.id}&name=${encodeURIComponent(memberName)}`);
  };

  // Sort members by status order from centralized config
  const sortedMembers = members?.sort((a, b) => {
    const getOrder = (status: string) => STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS]?.order ?? 999;
    return getOrder(a.status) - getOrder(b.status);
  });

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
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Active Clients Dashboard</h1>
        
        {!selectedSegment ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg">
            <p className="mb-4 text-muted-foreground">Please select a segment from the dropdown in the top left corner</p>
          </div>
        ) : sortedMembers && sortedMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMembers.map((member) => (
              <Card 
                key={member.id} 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => handleMemberClick(member)}
              >
                <h3 className="font-semibold text-lg">
                  {member.firstName} {member.lastName}
                </h3>
                <p className="text-sm text-gray-500">ID: {member.id}</p>
                <p className="text-sm text-gray-500">
                  HCP Level: {member.hcpLevel || "-"}
                </p>
                <p className="text-sm text-gray-500">
                  HCP Start Date: {member.hcpStartDate ? new Date(member.hcpStartDate).toLocaleDateString() : "-"}
                </p>
                <p className="text-sm text-gray-500">
                  {member.hcpEndDate ? `(End: ${new Date(member.hcpEndDate).toLocaleDateString()})` : ""}
                </p>
                <p className="text-sm mt-2">
                  <span className={`inline-block px-2 py-1 rounded-full ${getStatusBadgeColors(member.status)}`}>
                    {member.status}
                  </span>
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg">
            <p className="text-muted-foreground">No active clients found for the selected segment</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}