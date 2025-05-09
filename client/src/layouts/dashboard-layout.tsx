import { ReactNode } from "react";
import { Link } from "wouter";
import { UserCog } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import AppLayout from "./app-layout";

interface AdminNavigationProps {
  user: { role: string };
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export function AdminNavigation({ user }: AdminNavigationProps) {
  return (
    <>
      {user?.role === "admin" && (
        <>
          <Link
            href="/manage-users"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "w-full justify-start"
            )}
          >
            <UserCog className="mr-2 h-4 w-4" />
            Manage Users
          </Link>
        </>
      )}
    </>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppLayout>
      <div className="container mx-auto p-4 space-y-6">
        {children}
      </div>
    </AppLayout>
  );
}