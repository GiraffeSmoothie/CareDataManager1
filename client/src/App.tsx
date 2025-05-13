import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import MasterData from "@/pages/master-data";
import PersonInfo from "@/pages/person-info";
import ClientAssignment from "@/pages/client-assignment";
import DocumentUpload from "@/pages/document-upload";
import ManageClient from "@/pages/manage-client";
import Homepage from "@/pages/homepage";
import Settings from "@/pages/settings";
import ManageUsers from "@/pages/manage-users";
import Profile from "@/pages/profile";
import Company from "@/pages/company";
import { SegmentProvider } from "@/contexts/segment-context";
import { useState, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from "./lib/queryClient";
import { Loader2 } from "lucide-react";

interface AuthData {
  authenticated: boolean;
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

function PrivateRoute({ component: Component, ...rest }: any) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Check if the user is authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/status", {
          credentials: "include",
        });
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          setLocation("/login");
        }
      } catch (error) {
        setIsAuthenticated(false);
        setLocation("/login");
      }
    };

    checkAuth();
  }, [setLocation]);

  if (isAuthenticated === null) {
    // Loading state
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated && location !== "/login") {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const [loading, setLoading] = useState(true);
  const [_, setLocation] = useLocation();

  const { data: authData } = useQuery<AuthData>({
    queryKey: ["authStatus"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false
  });

  useEffect(() => {
    if (!loading) {
      if (!authData?.user) {
        setLocation("/login");
      } else if (authData.user.role !== "admin") {
        setLocation("/");
      }
    }
  }, [authData, loading, setLocation]);

  useEffect(() => {
    if (authData !== undefined) {
      setLoading(false);
    }
  }, [authData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authData?.user || authData.user.role !== "admin") {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Redirect to="/login" />
      </Route>
      <Route path="/homepage">
        <PrivateRoute component={Homepage} />
      </Route>
      <Route path="/master-data">
        <PrivateRoute component={MasterData} />
      </Route>
      <Route path="/person-info">
        <PrivateRoute component={PersonInfo} />
      </Route>
      <Route path="/manage-client">
        <PrivateRoute component={ManageClient} />
      </Route>
      <Route path="/client-assignment">
        <PrivateRoute component={ClientAssignment} />
      </Route>
      <Route path="/document-upload">
        <PrivateRoute component={DocumentUpload} />
      </Route>
      <Route path="/settings">
        <PrivateRoute component={Settings} />
      </Route>
      <Route path="/manage-users">
        <AdminRoute component={ManageUsers} />
      </Route>
      <Route path="/profile">
        <PrivateRoute component={Profile} />
      </Route>
      <Route path="/company">
        <AdminRoute component={Company} />
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SegmentProvider>
        <Router />
        <Toaster />
      </SegmentProvider>
    </QueryClientProvider>
  );
}

export default App;
