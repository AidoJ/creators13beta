import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText, Clock, Send, CheckCircle, AlertTriangle, UserPlus, ArrowRight, Loader2,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type CaseStudyStatus = Database["public"]["Enums"]["case_study_status"];

interface ClientInfo {
  id: string;
  name: string;
  email: string | null;
}

interface CaseStudySummary {
  id: string;
  title: string;
  status: CaseStudyStatus;
  subject_user_id: string | null;
  subject_name: string;
  updated_at: string;
}

interface CaseStudyPipelineProps {
  onSelectClient?: (clientId: string) => void;
  onStartCaseStudy?: (clientId: string, clientName: string) => void;
  onFilterByStatus?: (status: string) => void;
}

const PIPELINE_STAGES = [
  {
    key: "not_started" as const,
    label: "Not Started",
    description: "Clients awaiting assessment",
    icon: UserPlus,
    color: "bg-muted/60 text-muted-foreground border-border",
    dotColor: "bg-muted-foreground",
  },
  {
    key: "draft" as const,
    label: "In Progress",
    description: "Drafts being worked on",
    icon: Clock,
    color: "bg-accent/10 text-accent border-accent/20",
    dotColor: "bg-accent",
  },
  {
    key: "profiling_submitted" as const,
    label: "Profiling",
    description: "Awaiting trainer profiling",
    icon: Send,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  {
    key: "submitted" as const,
    label: "Submitted",
    description: "Awaiting trainer review",
    icon: Send,
    color: "bg-secondary/10 text-secondary border-secondary/20",
    dotColor: "bg-secondary",
  },
  {
    key: "revision_requested" as const,
    label: "Needs Revision",
    description: "Trainer feedback received",
    icon: AlertTriangle,
    color: "bg-destructive/10 text-destructive border-destructive/20",
    dotColor: "bg-destructive",
  },
  {
    key: "approved" as const,
    label: "Approved",
    description: "Certified assessments",
    icon: CheckCircle,
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    dotColor: "bg-green-500",
  },
] as const;

type StageKey = (typeof PIPELINE_STAGES)[number]["key"];

export default function CaseStudyPipeline({ onSelectClient, onStartCaseStudy, onFilterByStatus }: CaseStudyPipelineProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientsWithoutStudy, setClientsWithoutStudy] = useState<ClientInfo[]>([]);
  const [studiesByStatus, setStudiesByStatus] = useState<Record<string, CaseStudySummary[]>>({});

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      setLoading(true);

      // Fetch assigned clients
      const { data: assignments } = await supabase
        .from("client_practitioner")
        .select("client_id")
        .eq("practitioner_id", user!.id)
        .eq("active", true);

      const clientIds = (assignments || []).map(a => a.client_id);

      // Fetch case studies by this practitioner
      const { data: studies } = await supabase
        .from("case_studies")
        .select("id, title, status, subject_user_id, updated_at")
        .eq("practitioner_id", user!.id)
        .order("updated_at", { ascending: false });

      // Also fetch approved case studies for these clients by ANY practitioner
      const { data: allStudiesForClients } = clientIds.length > 0
        ? await supabase
            .from("case_studies")
            .select("id, status, subject_user_id")
            .in("subject_user_id", clientIds)
            .eq("status", "approved")
        : { data: [] };

      // Fetch creator type profiles to detect already-profiled clients
      const { data: creatorProfiles } = clientIds.length > 0
        ? await supabase
            .from("creator_type_profiles")
            .select("user_id, primary_type")
            .in("user_id", clientIds)
        : { data: [] };

      const profiledClientIds = new Set(
        (creatorProfiles || []).filter(cp => cp.primary_type).map(cp => cp.user_id)
      );

      const clientsWithApprovedStudy = new Set(
        (allStudiesForClients || [])
          .filter(s => s.subject_user_id)
          .map(s => s.subject_user_id!)
      );

      // Build name map
      const allUserIds = [
        ...clientIds,
        ...(studies || []).filter(s => s.subject_user_id).map(s => s.subject_user_id!),
      ];
      const uniqueIds = [...new Set(allUserIds)];

      const { data: profiles } = uniqueIds.length > 0
        ? await supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", uniqueIds)
        : { data: [] };

      const nameMap: Record<string, string> = {};
      const emailMap: Record<string, string | null> = {};
      (profiles || []).forEach(p => {
        nameMap[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown";
        emailMap[p.user_id] = p.email;
      });

      // Clients with case studies from THIS practitioner
      const clientsWithOwnStudy = new Set(
        (studies || []).filter(s => s.subject_user_id).map(s => s.subject_user_id!)
      );

      // Clients truly awaiting assessment: no study from this practitioner AND not already profiled
      const awaitingAssessment = clientIds
        .filter(id => !clientsWithOwnStudy.has(id) && !profiledClientIds.has(id) && !clientsWithApprovedStudy.has(id))
        .map(id => ({ id, name: nameMap[id] || "Unknown", email: emailMap[id] || null }));

      setClientsWithoutStudy(awaitingAssessment);

      // Group this practitioner's studies by status
      const grouped: Record<string, CaseStudySummary[]> = {};
      (studies || []).forEach(s => {
        const status = s.status as CaseStudyStatus;
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push({
          ...s,
          status,
          subject_name: s.subject_user_id ? (nameMap[s.subject_user_id] || "Unknown") : "—",
        });
      });

      // Add externally-profiled clients as virtual "approved" entries in the pipeline
      const externallyProfiled = clientIds.filter(
        id => !clientsWithOwnStudy.has(id) && (profiledClientIds.has(id) || clientsWithApprovedStudy.has(id))
      );
      if (externallyProfiled.length > 0) {
        if (!grouped["approved"]) grouped["approved"] = [];
        externallyProfiled.forEach(id => {
          grouped["approved"]!.push({
            id: `profiled-${id}`,
            title: `${nameMap[id] || "Unknown"} — Profiled`,
            status: "approved",
            subject_user_id: id,
            subject_name: nameMap[id] || "Unknown",
            updated_at: new Date().toISOString(),
          });
        });
      }

      setStudiesByStatus(grouped);
      setLoading(false);
    }

    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalStudies = Object.values(studiesByStatus).reduce((sum, arr) => sum + arr.length, 0);
  const totalClients = clientsWithoutStudy.length + totalStudies;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-bold text-foreground">Case Study Pipeline</h2>
          <Badge variant="outline" className="ml-auto text-xs">
            {totalStudies} of {totalClients} clients assessed
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          {PIPELINE_STAGES.map(stage => {
            const count = stage.key === "not_started"
              ? clientsWithoutStudy.length
              : (studiesByStatus[stage.key]?.length || 0);
            const pct = totalClients > 0 ? (count / totalClients) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={stage.key}
                className={`${stage.dotColor} h-full transition-all`}
                style={{ width: `${pct}%` }}
                title={`${stage.label}: ${count}`}
              />
            );
          })}
        </div>

        {/* Stage counts */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {PIPELINE_STAGES.map(stage => {
            const count = stage.key === "not_started"
              ? clientsWithoutStudy.length
              : (studiesByStatus[stage.key]?.length || 0);
            const StageIcon = stage.icon;
            return (
              <button
                key={stage.key}
                onClick={() => stage.key !== "not_started" && count > 0 && onFilterByStatus?.(stage.key)}
                className={`rounded-xl border p-3 text-center transition-all ${
                  count > 0 && stage.key !== "not_started" ? `${stage.color} cursor-pointer hover:opacity-80` : "bg-muted/20 text-muted-foreground/40 border-border/50"
                }`}
                disabled={stage.key === "not_started" || count === 0}
              >
                <StageIcon className="h-4 w-4 mx-auto mb-1" />
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs font-medium leading-tight">{stage.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action items — clients needing attention */}
      {clientsWithoutStudy.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Clients awaiting assessment ({clientsWithoutStudy.length})
          </p>
          <div className="space-y-2">
            {clientsWithoutStudy.map(client => (
              <div
                key={client.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                  {client.email && (
                    <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs shrink-0"
                  onClick={() => onStartCaseStudy?.(client.id, client.name)}
                >
                  Start Assessment <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revision required — urgent items */}
      {(studiesByStatus["revision_requested"]?.length || 0) > 0 && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs your revision ({studiesByStatus["revision_requested"].length})
          </p>
          <div className="space-y-2">
            {studiesByStatus["revision_requested"].map(cs => (
              <button
                key={cs.id}
                onClick={() => cs.subject_user_id && onSelectClient?.(cs.subject_user_id)}
                className="w-full flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cs.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {cs.subject_name} · Updated {new Date(cs.updated_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20 shrink-0">
                  Review Feedback
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drafts in progress */}
      {(studiesByStatus["draft"]?.length || 0) > 0 && (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Drafts in progress ({studiesByStatus["draft"].length})
          </p>
          <div className="space-y-2">
            {studiesByStatus["draft"].map(cs => (
              <div
                key={cs.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border px-3 py-2"
              >
              <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cs.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {cs.subject_name} · Updated {new Date(cs.updated_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20"
                  onClick={() => cs.subject_user_id && onStartCaseStudy?.(cs.subject_user_id, cs.subject_name)}
                >
                  Continue <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
