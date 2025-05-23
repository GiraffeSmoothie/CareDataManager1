import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { Heart, Database, Users, Link2, FileText } from "lucide-react";
import UserNav from "@/components/user-nav";
import SegmentSelector from "@/components/segment-selector";
import { cn } from "../lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Heart className="text-primary h-6 w-6" />
              <span className="text-xl font-semibold">Care System</span>
            </div>
            
            <div className="ml-4">
              <SegmentSelector />
            </div>
          </div>
          
          <UserNav />
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex space-x-4 overflow-x-auto">
            <Link href="/homepage">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/homepage"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-600"
              )}>
                <Heart className="h-4 w-4" />
                <span>Homepage</span>
              </div>
            </Link>
                        <Link href="/manage-client">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/manage-client" 
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <Users className="h-4 w-4" />
                <span>Client Details</span>
              </div>
            </Link>
            <Link href="/client-assignment">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/client-assignment" 
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <Link2 className="h-4 w-4" />
                <span>Client Services</span>
              </div>
            </Link>
            <Link href="/document-upload">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/document-upload" 
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <FileText className="h-4 w-4" />
                <span>Client Documents</span>
              </div>
            </Link>
            <Link href="/master-data">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/master-data" 
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <Database className="h-4 w-4" />
                <span>Services Inventory</span>
              </div>
            </Link>
          </div>
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
