import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronDown, User, Settings, LogOut, Building2 } from "lucide-react";
import { TokenStorage } from "@/lib/token-storage";

export default function UserNav() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Use React Query to manage auth status
  const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/status");
      return res.json();
    }
  });

  const userRole = authData?.user?.role;
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Clear tokens first
      TokenStorage.clearTokens();
      
      // Call logout endpoint (this is optional with JWT, mainly for server-side logging)
      try {
        await apiRequest("POST", "/api/auth/logout", {});
      } catch (error) {
        // Ignore errors from logout endpoint since tokens are already cleared
        console.log("Logout endpoint error (ignored):", error);
      }
      
      toast({
        title: "Success",
        description: "Successfully logged out",
        variant: "default",
      });
      setLocation("/login");
    } catch (error) {
      // Even if logout API fails, we still clear tokens and redirect
      TokenStorage.clearTokens();
      toast({
        title: "Success", // Still show success since tokens are cleared
        description: "Successfully logged out",
        variant: "default",
      });
      setLocation("/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative flex items-center gap-2 h-8 p-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-muted">
              {authData?.user?.username?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline-block text-sm font-medium">
            {authData?.user?.username || "User"}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/profile")}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/settings")}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        {userRole === "admin" && (
          <>
            <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/manage-users")}>
              <User className="mr-2 h-4 w-4" />
              <span>Manage Users</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/company")}>
              <Building2 className="mr-2 h-4 w-4" />
              <span>Manage Companies</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
