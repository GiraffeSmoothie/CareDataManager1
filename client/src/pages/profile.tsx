import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "@/layouts/app-layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, User, Badge, Mail, Building } from "lucide-react";

export default function Profile() {  
  // Fetch user data from the auth status endpoint
  const { data: authData, isLoading } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/status");
      return res.json();
    }
  });  // Company data is now included in the auth response
  const userCompany = authData?.user?.company;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const user = authData?.user;
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Enhanced Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground">
              View and manage your profile information
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Information Card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Your account details and role information
              </p>
            </CardHeader>            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                  <p className="text-lg font-medium">{user?.name || "Not set"}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-lg font-medium">{user?.username}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Company</p>
                  <p className="text-lg font-medium flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {userCompany?.company_name || "No company assigned"}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    user?.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                    user?.role === 'manager' ? 'bg-blue-100 text-blue-800' : 
                    'bg-green-100 text-green-800'
                  }`}>
                    <Badge className="h-3 w-3 mr-1" />
                    {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Account Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Account Status: <span className="text-green-600 font-medium">Active</span></p>
                <p>Last Login: <span className="font-medium">Today</span></p>
                <p>Account Type: <span className="font-medium capitalize">{user?.role}</span></p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}