import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User, Gamepad2, Globe, Users, GraduationCap, Settings, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import logo from "@/assets/13creators-logo.png";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface DashboardHeaderProps {
  email?: string;
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: typeof User;
  show: boolean;
  /** Match nested routes (e.g. /play also active on /play/new). */
  nested?: boolean;
}

export default function DashboardHeader({ email, onSignOut }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profileComplete, setProfileComplete] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [rolesRes, profRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("profile_completed_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
      setProfileComplete(!!profRes.data?.profile_completed_at);
    })();
  }, []);

  const isPractitioner = roles.some((r) => ["practitioner", "trainee", "trainer"].includes(r));
  const isTrainerOrAdmin = roles.includes("trainer") || roles.includes("admin");
  const isTrainer = roles.includes("trainer");

  // Core sections — Me, Play, Community. Community gated on profile completion
  // only (visibility is a "be seen" gate, not a "see" gate).
  const coreNav: NavItem[] = [
    { label: "Me", path: "/dashboard", icon: User, show: true },
    { label: "Play", path: "/play", icon: Gamepad2, show: true, nested: true },
    { label: "Community", path: "/community/dashboard", icon: Globe, show: profileComplete, nested: true },
  ];

  // Role-gated tools.
  const toolsNav: NavItem[] = [
    { label: "Practitioner", path: "/practitioner", icon: Users, show: isPractitioner },
    { label: "Trainer", path: "/trainer", icon: GraduationCap, show: isTrainer },
    { label: "Admin", path: "/admin", icon: Settings, show: isTrainerOrAdmin },
  ];

  const visibleCore = coreNav.filter((n) => n.show);
  const visibleTools = toolsNav.filter((n) => n.show);

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (item.nested && location.pathname.startsWith(item.path + "/")) return true;
    return false;
  };

  const renderButton = (item: NavItem, mobile = false) => (
    <Button
      key={item.path}
      variant={isActive(item) ? "default" : "ghost"}
      size="sm"
      className={cn(
        "text-xs h-8 transition-all",
        mobile && "w-full justify-start h-9",
        isActive(item)
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "hover:bg-primary/10 hover:text-primary",
      )}
      onClick={() => {
        navigate(item.path);
        if (mobile) setMobileOpen(false);
      }}
    >
      <item.icon className={cn("h-3.5 w-3.5", mobile ? "mr-2" : "mr-1")} />
      {item.label}
    </Button>
  );

  return (
    <header className="border-b border-primary/20 bg-gradient-to-r from-primary/5 via-card/95 to-secondary/5 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
      <div className="container mx-auto flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2">
            <img src={logo} alt="13 Creators" className="h-7" />
          </a>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {visibleCore.map((item) => renderButton(item))}
            {visibleTools.length > 0 && (
              <span aria-hidden className="mx-2 h-5 w-px bg-border" />
            )}
            {visibleTools.map((item) => renderButton(item))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={onSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-1" /> Sign Out
          </Button>
          <button
            className="sm:hidden p-1.5 text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {/* Mobile nav dropdown — grouped Sections / Tools */}
      {mobileOpen && (
        <nav className="sm:hidden border-t border-primary/10 bg-card/95 px-4 py-3 space-y-3">
          <div>
            <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Sections
            </p>
            <div className="space-y-1">{visibleCore.map((item) => renderButton(item, true))}</div>
          </div>
          {visibleTools.length > 0 && (
            <div>
              <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Tools
              </p>
              <div className="space-y-1">{visibleTools.map((item) => renderButton(item, true))}</div>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
