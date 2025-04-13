import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { Heart, Database, Users, LayoutDashboard, Link2, BookOpen, FileText, ChevronDown } from "lucide-react";
import UserNav from "@/components/user-nav";
import { cn } from "../lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="text-primary h-6 w-6" />
            <span className="text-xl font-semibold">Care System</span>
          </div>
          
          <UserNav />
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex space-x-4 overflow-x-auto">
            <Link href="/dashboard">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                location === "/dashboard" 
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
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
                <span>HCP Data</span>
              </div>
            </Link>
            <div className="relative group">
              <div className={cn(
                "flex items-center gap-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:text-primary",
                ["/manage-members", "/person-info", "/member-assignment", "/case-notes", "/document-upload"].includes(location)
                  ? "border-primary text-primary" 
                  : "border-transparent text-gray-600"
              )}>
                <Users className="h-4 w-4" />
                <span>Manage Members</span>
                <ChevronDown className="h-4 w-4 ml-1" />
              </div>
              
              <div className="absolute hidden group-hover:block w-48 bg-white border rounded-md shadow-lg py-1 z-50">
                <Link href="/person-info">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100",
                    location === "/person-info" ? "text-primary" : "text-gray-600"
                  )}>
                    <Users className="h-4 w-4" />
                    <span>Add Client</span>
                  </div>
                </Link>
                <Link href="/member-assignment">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100",
                    location === "/member-assignment" ? "text-primary" : "text-gray-600"
                  )}>
                    <Link2 className="h-4 w-4" />
                    <span>Member Assignment</span>
                  </div>
                </Link>
                <Link href="/case-notes">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100",
                    location === "/case-notes" ? "text-primary" : "text-gray-600"
                  )}>
                    <BookOpen className="h-4 w-4" />
                    <span>Case Notes</span>
                  </div>
                </Link>
                <Link href="/document-upload">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100",
                    location === "/document-upload" ? "text-primary" : "text-gray-600"
                  )}>
                    <FileText className="h-4 w-4" />
                    <span>Documents</span>
                  </div>
                </Link>
              </div>
            </div>
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
