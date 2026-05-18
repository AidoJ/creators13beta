import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Users, GraduationCap, Settings, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logo from "@/assets/13creators-logo.png";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface DashboardHeaderProps {
  email?: string;
  onSignOut: () => void;
}

export default function DashboardHeader({ email, onSignOut }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function fetchRoles() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (data) setRoles(data.map(r => r.role));
    }
    fetchRoles();
  }, []);

  const isPractitioner = roles.some(r => ["practitioner", "trainee", "trainer"].includes(r));
  const isTrainerOrAdmin = roles.includes("trainer") || roles.includes("admin");
  const isTrainer = roles.includes("trainer");

  const navItems = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, show: true },
    { label: "Practitioner", path: "/practitioner", icon: Users, show: isPractitioner },
    { label: "Trainer", path: "/trainer", icon: GraduationCap, show: isTrainer },
    { label: "Admin", path: "/admin", icon: Settings, show: isTrainerOrAdmin },
  ];

  const visibleNavItems = navItems.filter(n => n.show);

  return (
    <header className="border-b border-primary/20 bg-gradient-to-r from-primary/5 via-card/95 to-secondary/5 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2">
            <img src={logo} alt="13 Creators" className="h-7" />
          </a>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {visibleNavItems.map(item => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "text-xs h-8 transition-all",
                  location.pathname === item.path
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "hover:bg-primary/10 hover:text-primary"
                )}
                onClick={() => navigate(item.path)}
              >
                <item.icon className="h-3.5 w-3.5 mr-1" />
                {item.label}
              </Button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={onSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-1" /> Sign Out
          </Button>
          {/* Mobile menu toggle */}
          <button
            className="sm:hidden p-1.5 text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="sm:hidden border-t border-primary/10 bg-card/95 px-4 py-2 space-y-1">
          {visibleNavItems.map(item => (
            <Button
              key={item.path}
              variant={location.pathname === item.path ? "default" : "ghost"}
              size="sm"
              className={cn(
                "w-full justify-start text-xs h-9 transition-all",
                location.pathname === item.path
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "hover:bg-primary/10 hover:text-primary"
              )}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
            >
              <item.icon className="h-3.5 w-3.5 mr-2" />
              {item.label}
            </Button>
          ))}
        </nav>
      )}
    </header>
  );
}
