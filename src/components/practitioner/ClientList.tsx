import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCreatorTypeColor, sortCreatorTypes } from "@/lib/creatorTypes";

interface ClientRow {
  client_id: string;
  profile: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    enrollment_step: string | null;
    case_study_consent_at: string | null;
  } | null;
  creatorTypes: string[];
}

interface ClientListProps {
  onSelectClient: (clientId: string) => void;
  selectedClientId: string | null;
}

export default function ClientList({ onSelectClient, selectedClientId }: ClientListProps) {
  const detailRef = typeof window !== "undefined" ? document.getElementById("client-detail-panel") : null;
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;

    async function fetchClients() {
      // Get assigned client IDs
      const { data: assignments } = await supabase
        .from("client_practitioner")
        .select("client_id")
        .eq("practitioner_id", user!.id)
        .eq("active", true);

      if (!assignments || assignments.length === 0) {
        setLoading(false);
        return;
      }

      const clientIds = assignments.map(a => a.client_id);

      // Fetch profiles for those clients
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, enrollment_step, case_study_consent_at")
        .in("user_id", clientIds);

      // Fetch creator type profiles — all 4 slots
      const { data: creatorProfiles } = await supabase
        .from("creator_type_profiles")
        .select("user_id, primary_type, secondary_type, type_3, type_4")
        .in("user_id", clientIds);

      const rows: ClientRow[] = clientIds.map(cid => {
        const prof = profiles?.find(p => p.user_id === cid) || null;
        const ct = creatorProfiles?.find(c => c.user_id === cid);
        const types: string[] = [];
        if (ct) {
          [ct.primary_type, ct.secondary_type, ct.type_3, ct.type_4].forEach(t => {
            if (t) types.push(t);
          });
        }
        return {
          client_id: cid,
          profile: prof ? {
            first_name: prof.first_name,
            last_name: prof.last_name,
            email: prof.email,
            enrollment_step: prof.enrollment_step,
            case_study_consent_at: prof.case_study_consent_at,
          } : null,
          creatorTypes: types,
        };
      });

      setClients(rows);
      setLoading(false);
    }

    fetchClients();
  }, [user]);

  const filtered = clients.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${c.profile?.first_name || ""} ${c.profile?.last_name || ""}`.toLowerCase();
    return name.includes(q) || (c.profile?.email || "").toLowerCase().includes(q);
  });

  const stepLabel = (step: string | null, isCaseStudy: boolean, typeCount: number) => {
    // Creator type assignment takes precedence over enrollment step
    if (typeCount >= 4) return isCaseStudy ? "Case Study Complete" : "Creator Blueprint Complete";
    if (typeCount >= 1) return "Partial Profile";
    if (step === "complete") {
      if (isCaseStudy) return "Case Study Complete";
      return "Partial Profile";
    }
    if (!step) return "Not Started";
    return step.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const stepColor = (step: string | null, typeCount: number) => {
    // Fully profiled = green
    if (typeCount >= 4) return "bg-green-500/10 text-green-600 border-green-500/20";
    // Partial profile (1-3 types) = amber
    if (typeCount >= 1) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    // No types yet — fall back to enrollment progress
    if (step === "complete") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    if (step === "photos_uploaded" || step === "booking_made") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    return "bg-muted/50 text-muted-foreground border-border";
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-bold text-foreground">My Clients</h2>
        <span className="ml-auto text-sm text-muted-foreground">{clients.length}</span>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading clients…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {clients.length === 0 ? "No clients assigned yet." : "No matching clients."}
          </div>
        ) : (
          filtered.map(client => (
            <button
              key={client.client_id}
              onClick={() => {
                onSelectClient(client.client_id);
                setTimeout(() => {
                  document.getElementById("client-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              }}
              className={`group w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-accent/50 transition-colors cursor-pointer ${
                selectedClientId === client.client_id ? "bg-accent/30" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-foreground truncate flex-1">
                  {client.profile?.first_name || "Unknown"} {client.profile?.last_name || ""}
                </p>
                <ChevronRight className="h-4 w-4 text-primary/60 group-hover:text-primary flex-shrink-0 transition-colors" />
              </div>
              <p className="text-xs text-muted-foreground truncate mb-1.5">{client.profile?.email || ""}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className={`text-[10px] ${stepColor(client.profile?.enrollment_step || null, client.creatorTypes.length)}`}>
                  {stepLabel(client.profile?.enrollment_step || null, !!client.profile?.case_study_consent_at, client.creatorTypes.length)}
                </Badge>
                {sortCreatorTypes(client.creatorTypes).map(t => {
                  const color = getCreatorTypeColor(t);
                  return (
                    <span
                      key={t}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
