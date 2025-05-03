import { Card } from "@/components/ui/card"
import AppLayout from "@/layouts/app-layout"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

interface Member {
  id: number
  firstName: string
  lastName: string
  status: string
  hcpLevel?: string
  hcpEndDate?: string
}

export default function Homepage() {
  const { data: members, isLoading } = useQuery({
    queryKey: ["/api/person-info"],
    queryFn: async () => {
      const response = await axios.get("/api/person-info");
      // Filter for active members only
      return (response.data as Member[]).filter(m => m.status === "Active" || m.status === "Paused" || m.status === "Created");
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Active Members Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members?.map((member) => (
            <Card key={member.id} className="p-4">
              <h3 className="font-semibold text-lg">
                {member.firstName} {member.lastName}
              </h3>
              <p className="text-sm text-gray-500">ID: {member.id}</p>
              <p className="text-sm text-gray-500">
                HCP: {member.hcpLevel || "-"} {member.hcpEndDate ? `(End: ${new Date(member.hcpEndDate).toLocaleDateString()})` : ""}
              </p>
              <p className="text-sm mt-2">
                <span className="inline-block px-2 py-1 rounded-full bg-green-100 text-green-800">
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