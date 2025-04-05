import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import MasterData from "@/pages/master-data";
import PersonInfo from "@/pages/person-info";
import Dashboard from "@/pages/dashboard";
import MemberAssignment from "@/pages/member-assignment";
import CaseNotes from "@/pages/case-notes";
import DocumentUpload from "@/pages/document-upload";
import { useState, useEffect } from "react";

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
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated && location !== "/login") {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <PrivateRoute component={Dashboard} />
      </Route>
      <Route path="/master-data">
        <PrivateRoute component={MasterData} />
      </Route>
      <Route path="/person-info">
        <PrivateRoute component={PersonInfo} />
      </Route>
      <Route path="/member-assignment">
        <PrivateRoute component={MemberAssignment} />
      </Route>
      <Route path="/case-notes">
        <PrivateRoute component={CaseNotes} />
      </Route>
      <Route path="/document-upload">
        <PrivateRoute component={DocumentUpload} />
      </Route>
      {/* Fallback to 404 */}
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
