import { Card } from "@/components/ui/card"
import AppLayout from "@/layouts/app-layout"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useLocation } from "wouter"

interface Member {
  id: number
  firstName: string
  lastName: string
  status: string
  hcpLevel?: string
  hcpEndDate?: string
}

export default function Homepage() {
  const [_, setLocation] = useLocation();
  const { data: members, isLoading } = useQuery({
    queryKey: ["/api/person-info"],
    queryFn: async () => {
      const response = await axios.get("/api/person-info");
      // Filter for active members only
      return (response.data as Member[]).filter(m => m.status === "Active" || m.status === "Paused" || m.status === "New");
    },
  });

  const handleMemberClick = (member: Member) => {
    const memberName = `${member.firstName} ${member.lastName}`;
    setLocation(`/member-assignment?memberId=${member.id}&name=${encodeURIComponent(memberName)}`);
  };

  // Get badge colors based on status
  const getStatusBadgeColors = (status: string): string => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-800"; // Keep active as green
      case "New":
        return "bg-blue-100 text-blue-800";   // Blue for new
      case "Paused":
        return "bg-amber-100 text-amber-800"; // Amber/yellow for paused
      default:
        return "bg-gray-100 text-gray-800";   // Default fallback
    }
  };

  // Sort members by status order: Active, New, Paused
  const sortedMembers = members?.sort((a, b) => {
    const statusOrder: {[key: string]: number} = {
      "Active": 0,
      "New": 1,
      "Paused": 2,
    };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Active Members Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedMembers?.map((member) => (
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
                HCP: {member.hcpLevel || "-"} {member.hcpEndDate ? `(End: ${new Date(member.hcpEndDate).toLocaleDateString()})` : ""}
              </p>
              <p className="text-sm mt-2">
                <span className={`inline-block px-2 py-1 rounded-full ${getStatusBadgeColors(member.status)}`}>
                  {member.status}
                </span>
              </p>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}