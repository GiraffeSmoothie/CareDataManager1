import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Heart, 
  Database, 
  Users, 
  Link2, 
  FileText, 
  Home,
  Settings,
  Building2
} from "lucide-react";
import UserNav from "@/components/user-nav";
import SegmentSelector from "@/components/segment-selector";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarTrigger,
  SidebarInset
} from "@/components/ui/sidebar";

interface AppLayoutProps {
  children: ReactNode;
}

const navigationItems = [
  {
    title: "Homepage",
    url: "/homepage",
    icon: Home,
  },
  {
    title: "Client Details",
    url: "/manage-client",
    icon: Users,
  },
  {
    title: "Client Services",
    url: "/client-assignment",
    icon: Link2,
  },
  {
    title: "Client Documents",
    url: "/document-upload",
    icon: FileText,
  },  {
    title: "Services Inventory",
    url: "/master-data",
    icon: Database,
  },
  {
    title: "Companies",
    url: "/company",
    icon: Building2,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  
  // Fetch auth data to determine user role
  const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/status");
      return res.json();
    }
  });

  const userRole = authData?.user?.role;
  
  // Filter navigation items based on user role
  const filteredNavigationItems = navigationItems.filter(item => {
    // Show Companies menu only for admin users
    if (item.url === "/company") {
      return userRole === "admin";
    }
    // Show all other items for all users
    return true;
  });
  
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar variant="inset">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-4 py-2">
              <Heart className="text-primary h-8 w-8" />
              <div className="flex flex-col">
                <span className="text-lg font-bold text-sidebar-foreground">CareTrackAU</span>
                <span className="text-xs text-muted-foreground">Care Management</span>
              </div>
            </div>
          </SidebarHeader>          <SidebarContent className="px-2">
            <SidebarMenu>
              {filteredNavigationItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        
        <SidebarInset>
          {/* Enhanced Header */}
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="h-4 w-px bg-sidebar-border" />
              <SegmentSelector />
            </div>
            <div className="ml-auto px-4">
              <UserNav />
            </div>
          </header>
          
          {/* Enhanced Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto p-6 space-y-6">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
