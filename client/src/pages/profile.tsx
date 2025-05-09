import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/layouts/app-layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { Error } from "@/components/ui/error";

export default function Profile() {
  // Fetch user data from the auth status endpoint
  const { data: authData, isLoading, error } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const res = await fetch("/api/auth/status");
      if (!res.ok) throw new Error("Failed to fetch auth status");
      return res.json();
    }
  });

  if (isLoading) {
    return (
      <AppLayout>
        <Loading text="Loading profile..." />
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Error
          variant="card"
          fullPage
          title="Failed to Load Profile"
          message={error instanceof Error ? error.message : "Could not load your profile information"}
        />
      </AppLayout>
    );
  }

  const user = authData?.user;

  return (
    <AppLayout>
      <div className="container max-w-2xl py-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p className="font-medium">{user?.name || "Not set"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Username</p>
                <p className="font-medium">{user?.username}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Role</p>
                <p className="font-medium capitalize">{user?.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}