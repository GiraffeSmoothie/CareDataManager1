import { Switch, Route, useLocation } from "wouter";
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
import { useState, useEffect } from "react";
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from "./lib/queryClient";
import { Loading } from "@/components/ui/loading";

interface AuthData {
  authenticated: boolean;
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

function PrivateRoute({ component: Component, ...rest }: any) {
  const [_, setLocation] = useLocation();

  const { data: authData, isLoading } = useQuery<AuthData>({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const response = await fetch("/api/auth/status", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Unauthorized");
      }
      return response.json();
    },
    retry: false,
    staleTime: 5000 // Consider data fresh for 5 seconds
  });

  useEffect(() => {
    if (!isLoading && !authData?.authenticated) {
      setLocation("/login");
    }
  }, [authData, isLoading, setLocation]);

  if (isLoading) {
    return <Loading text="Loading..." />;
  }

  if (!authData?.authenticated) {
    return null;
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
    return <Loading text="Loading..." />;
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
      <Route path="/homepage">
        <PrivateRoute component={Homepage} />
      </Route>
      <Route path="/">
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
