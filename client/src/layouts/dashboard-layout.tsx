import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import UserNav from "@/components/user-nav";

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
      
      {/* Main Content */}
      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
