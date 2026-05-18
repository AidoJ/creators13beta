import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Camera,
  UserPlus,
} from "lucide-react";
import { getCreatorTypeColor } from "@/lib/creatorTypes";

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enrollment_step: string | null;
  practitioner_code: string | null;
  practitioner_status: string | null;
  training_started_at: string | null;
  roles: string[];
  tier: string | null;
  sub_status: string | null;
}

interface CaseStudyRow {
  id: string;
  title: string;
  status: string;
  practitioner_id: string;
  practitioner_name: string;
  subject_name: string;
  subject_user_id: string | null;
  creator_types_identified: string[] | null;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  client_id: string;
  practitioner_id: string;
  client_name: string;
  practitioner_name: string;
  active: boolean;
}

interface PhotoCount {
  user_id: string;
  count: number;
}

interface PractitionersTabProps {
  users: UserRow[];
  caseStudies: CaseStudyRow[];
  assignments: AssignmentRow[];
  photoCounts: PhotoCount[];
  onViewCaseStudy?: (caseStudyId: string) => void;
}

const statusColors: Record<string, string> = {
  in_progress: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  paused: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
  certified: "bg-green-500/10 text-green-600 border-green-500/20",
};

const caseStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  draft: { label: "Draft", icon: Clock, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  submitted: { label: "Pending Review", icon: FileText, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  revision_requested: { label: "Needs Revision", icon: XCircle, color: "bg-red-500/10 text-red-600 border-red-500/20" },
  approved: { label: "Approved", icon: CheckCircle, color: "bg-green-500/10 text-green-600 border-green-500/20" },
};

export default function PractitionersTab({ users, caseStudies, assignments, photoCounts, onViewCaseStudy }: PractitionersTabProps) {
  const [expandedPractitioner, setExpandedPractitioner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const photoCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    photoCounts.forEach(p => { map[p.user_id] = p.count; });
    return map;
  }, [photoCounts]);

  const practitioners = useMemo(() => {
    return users
      .filter(u => u.roles.includes("practitioner") || u.roles.includes("trainee"))
      .sort((a, b) => {
        const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
        const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [users]);

  const practitionerData = useMemo(() => {
    return practitioners.map(prac => {
      const clientAssignments = assignments.filter(a => a.practitioner_id === prac.user_id && a.active);
      const clientIds = clientAssignments.map(a => a.client_id);
      const clientUsers = users.filter(u => clientIds.includes(u.user_id));
      const pracCaseStudies = caseStudies.filter(cs => cs.practitioner_id === prac.user_id);

      const caseCounts: Record<string, number> = {};
      pracCaseStudies.forEach(cs => {
        caseCounts[cs.status] = (caseCounts[cs.status] || 0) + 1;
      });

      // Map clients to their case studies
      const clientsWithCases = clientUsers.map(client => {
        const clientCases = pracCaseStudies.filter(cs => cs.subject_user_id === client.user_id);
        return {
          ...client,
          caseStudies: clientCases,
          photoCount: photoCountMap[client.user_id] || 0,
        };
      });

      // Sort clients: those with case studies first, then alphabetically
      clientsWithCases.sort((a, b) => {
        if (a.caseStudies.length !== b.caseStudies.length) return b.caseStudies.length - a.caseStudies.length;
        const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
        const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      const cohort = prac.training_started_at
        ? new Date(prac.training_started_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
        : null;

      return {
        ...prac,
        cohort,
        clients: clientsWithCases,
        totalCases: pracCaseStudies.length,
        caseCounts,
      };
    });
  }, [practitioners, assignments, users, caseStudies, photoCountMap]);

  const filtered = useMemo(() => {
    if (!search) return practitionerData;
    const q = search.toLowerCase();
    return practitionerData.filter(p => {
      const pracMatch = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase().includes(q)
        || (p.email || "").toLowerCase().includes(q)
        || (p.practitioner_code || "").toLowerCase().includes(q);
      const clientMatch = p.clients.some(c =>
        `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(q)
        || (c.email || "").toLowerCase().includes(q)
      );
      return pracMatch || clientMatch;
    });
  }, [practitionerData, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search practitioners or clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          No practitioners found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(prac => {
            const isExpanded = expandedPractitioner === prac.user_id;
            const name = `${prac.first_name || ""} ${prac.last_name || ""}`.trim() || "Unknown";

            return (
              <div key={prac.user_id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Practitioner header row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedPractitioner(isExpanded ? null : prac.user_id)}
                >
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{name}</span>
                      {prac.practitioner_status && (
                        <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[prac.practitioner_status] || ""}`}>
                          {prac.practitioner_status.replace(/_/g, " ")}
                        </Badge>
                      )}
                      {prac.cohort && (
                        <Badge variant="outline" className="text-[10px]">{prac.cohort}</Badge>
                      )}
                      {prac.practitioner_code && (
                        <span className="text-[10px] font-mono text-muted-foreground">{prac.practitioner_code}</span>
                      )}
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{prac.clients.length}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{prac.totalCases}</span>
                    </div>
                    {/* Mini status indicators */}
                    <div className="flex gap-1">
                      {Object.entries(prac.caseCounts).map(([status, count]) => {
                        const config = caseStatusConfig[status];
                        if (!config) return null;
                        return (
                          <span
                            key={status}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${config.color}`}
                          >
                            {count}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </button>

                {/* Expanded client list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {prac.clients.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        <UserPlus className="h-5 w-5 mx-auto mb-1 opacity-40" />
                        No clients assigned yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {prac.clients.map(client => {
                          const clientName = `${client.first_name || ""} ${client.last_name || ""}`.trim() || "Unknown";
                          const cs = client.caseStudies[0]; // Primary case study

                          return (
                            <div
                              key={client.user_id}
                              className="flex items-center gap-3 px-4 py-2.5 pl-11 hover:bg-accent/20 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{clientName}</span>
                                  <span className="text-[10px] text-muted-foreground">{client.email}</span>
                                </div>
                                {/* Creator types */}
                                {cs?.creator_types_identified && cs.creator_types_identified.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {cs.creator_types_identified.map(t => {
                                      const c = getCreatorTypeColor(t);
                                      return (
                                        <span
                                          key={t}
                                          className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold capitalize"
                                          style={{ backgroundColor: `${c}22`, color: c, border: `1px solid ${c}44` }}
                                        >
                                          {t}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Photo count */}
                              <div className="flex items-center gap-1 text-muted-foreground" title={`${client.photoCount} photos`}>
                                <Camera className="h-3 w-3" />
                                <span className="text-[10px]">{client.photoCount}</span>
                              </div>

                              {/* Case study status */}
                              {cs ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] cursor-pointer ${caseStatusConfig[cs.status]?.color || ""}`}
                                  onClick={() => onViewCaseStudy?.(cs.id)}
                                >
                                  {caseStatusConfig[cs.status]?.label || cs.status}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">No case study</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
