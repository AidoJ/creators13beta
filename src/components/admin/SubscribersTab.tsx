import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { isPaidTier, buildCaseStudySubjectSet } from "@/lib/clientClassification";

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enrollment_step: string | null;
  roles: string[];
  tier: string | null;
  sub_status: string | null;
}

interface CaseStudySubject {
  subject_user_id: string | null;
}

interface SubscribersTabProps {
  users: UserRow[];
  caseStudies: CaseStudySubject[];
  assignedPracMap: Record<string, string>;
}

const tierColors: Record<string, string> = {
  wren: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  robin: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  falcon: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  owl: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export default function SubscribersTab({ users, caseStudies, assignedPracMap }: SubscribersTabProps) {
  const [search, setSearch] = useState("");

  const caseStudySubjects = useMemo(
    () => buildCaseStudySubjectSet(caseStudies),
    [caseStudies]
  );

  // Paying subscribers = users with a paid tier (robin/falcon/owl)
  // Case study subjects on Wren are NOT subscribers — they appear under Practitioners
  const subscribers = useMemo(() => {
    return users.filter(u => isPaidTier(u.tier));
  }, [users]);

  const filtered = useMemo(() => {
    if (!search) return subscribers;
    const q = search.toLowerCase();
    return subscribers.filter(u =>
      `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase().includes(q)
      || (u.email || "").toLowerCase().includes(q)
      || (u.tier || "").toLowerCase().includes(q)
    );
  }, [subscribers, search]);

  const stepLabel = (step: string | null) =>
    step ? step.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—";

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search subscribers by name, email, or tier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Tier</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Enrollment</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Practitioner</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Origin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No paying subscribers found.
                  </td>
                </tr>
              ) : (
                filtered.map(u => {
                  const wasCS = caseStudySubjects.has(u.user_id);
                  return (
                    <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {u.first_name || "—"} {u.last_name || ""}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{u.email || "—"}</td>
                      <td className="px-4 py-2.5">
                        {u.tier ? (
                          <Badge variant="outline" className={`text-[10px] capitalize ${tierColors[u.tier] || ""}`}>
                            {u.tier}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {u.sub_status ? (
                          <Badge variant="outline" className="text-[10px] capitalize">{u.sub_status}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[10px] capitalize">{stepLabel(u.enrollment_step)}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {assignedPracMap[u.user_id] || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {wasCS ? (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                            Upgraded from Case Study
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Direct</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Showing {filtered.length} paying subscriber{filtered.length !== 1 ? "s" : ""} (Robin, Falcon, or Owl tier).
      </p>
    </div>
  );
}
