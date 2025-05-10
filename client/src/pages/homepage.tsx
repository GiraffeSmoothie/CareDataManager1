import { Card } from "@/components/ui/card"
import AppLayout from "@/layouts/app-layout"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useLocation } from "wouter"
import { STATUS_CONFIGS, getStatusBadgeColors } from '@/lib/constants';

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
    setLocation(`/client-assignment?clientId=${member.id}&name=${encodeURIComponent(memberName)}`);
  };

  // Sort members by status order from centralized config
  const sortedMembers = members?.sort((a, b) => {
    const getOrder = (status: string) => STATUS_CONFIGS[status as keyof typeof STATUS_CONFIGS]?.order ?? 999;
    return getOrder(a.status) - getOrder(b.status);
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Active Clients Dashboard</h1>
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
      </div>
    </AppLayout>
  );
}