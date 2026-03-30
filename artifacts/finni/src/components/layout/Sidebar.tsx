import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Building2, Settings, LogOut, BarChart3 } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [location] = useLocation();
  const { user, isAdmin } = useAuth();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync({});
      queryClient.clear();
      window.location.href = "/login";
    } catch (e) {
      console.error(e);
    }
  };

  const navItems = [
    { href: "/projects", label: "Projects", icon: Building2 },
    ...(isAdmin ? [{ href: "/settings/users", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen border-r border-sidebar-border shrink-0 font-medium">
      <div className="p-6">
        <div className="flex items-center gap-2 text-sidebar-primary font-bold text-lg tracking-tight">
          <BarChart3 className="h-5 w-5" />
          <span>Finni</span>
        </div>
        {user?.tenantName && (
          <div className="mt-2 text-xs text-sidebar-foreground/60 uppercase tracking-wider font-semibold">
            {user.tenantName}
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-sidebar-border">
        <div className="flex flex-col gap-3">
          <div className="px-2">
            <div className="text-sm font-medium">{user?.fullName}</div>
            <div className="text-xs text-sidebar-foreground/60 capitalize">{user?.role}</div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
