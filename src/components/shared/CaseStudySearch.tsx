import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, FileText, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCreatorTypeColor, sortCreatorTypes } from "@/lib/creatorTypes";
import type { Database } from "@/integrations/supabase/types";

type CaseStudyStatus = Database["public"]["Enums"]["case_study_status"];

interface SearchResult {
  type: "case_study" | "client";
  id: string;
  name: string;
  subtitle: string;
  caseStudyId?: string;
  clientId?: string;
  status?: CaseStudyStatus;
  creatorTypes?: string[];
}

interface CaseStudySearchProps {
  onSelectCaseStudy?: (caseStudyId: string) => void;
  onSelectClient?: (clientId: string) => void;
}

const statusStyles: Record<CaseStudyStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted/50 text-muted-foreground border-border" },
  profiling_submitted: { label: "Profiling", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  submitted: { label: "Pending", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  approved: { label: "Approved", cls: "bg-green-500/10 text-green-600 border-green-500/20" },
  revision_requested: { label: "Revision", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export default function CaseStudySearch({ onSelectCaseStudy, onSelectClient }: CaseStudySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const q = query.trim().toLowerCase();
      const merged: SearchResult[] = [];

      // Fetch case studies and all accessible profiles in parallel
      const [casesRes, allProfilesRes] = await Promise.all([
        supabase
          .from("case_studies")
          .select("id, title, status, subject_user_id, practitioner_id, creator_types_identified")
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email"),
      ]);

      const cases = casesRes.data || [];
      const allProfiles = allProfilesRes.data || [];

      // Build name/email maps from all profiles
      const nameMap: Record<string, string> = {};
      const emailMap: Record<string, string> = {};
      allProfiles.forEach(p => {
        nameMap[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown";
        emailMap[p.user_id] = p.email || "";
      });

      // Match case studies
      cases.forEach(c => {
        const subjectName = c.subject_user_id ? nameMap[c.subject_user_id] || "Unknown" : "—";
        const practName = nameMap[c.practitioner_id] || "Unknown";
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesSubject = subjectName.toLowerCase().includes(q);
        const matchesPract = practName.toLowerCase().includes(q);

        if (matchesTitle || matchesSubject || matchesPract) {
          merged.push({
            type: "case_study",
            id: c.id,
            name: subjectName !== "—" ? subjectName : c.title,
            subtitle: `Case Study · By ${practName}`,
            caseStudyId: c.id,
            clientId: c.subject_user_id || undefined,
            status: c.status as CaseStudyStatus,
            creatorTypes: c.creator_types_identified || undefined,
          });
        }

        if (c.subject_user_id) {
          // no-op: we now always show client entries too
        }
      });

      // Match clients from all accessible profiles (always include alongside case studies)
      allProfiles.forEach(p => {
        const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
        const email = (p.email || "").toLowerCase();
        if (name.includes(q) || email.includes(q)) {
          merged.push({
            type: "client",
            id: p.user_id,
            name: nameMap[p.user_id],
            subtitle: p.email || "Client",
            clientId: p.user_id,
          });
        }
      });

      setResults(merged.slice(0, 20));
      setOpen(true);
      setLoading(false);
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handleSelect(result: SearchResult) {
    if (result.type === "case_study" && result.caseStudyId && onSelectCaseStudy) {
      onSelectCaseStudy(result.caseStudyId);
    }
    // Also navigate to client detail if the result has a clientId
    if (result.clientId && onSelectClient) {
      onSelectClient(result.clientId);
    }
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search clients & case studies…"
          className="pl-9 pr-8"
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border bg-popover shadow-lg max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No results found.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}-${i}`}
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors flex items-center gap-3 border-b border-border last:border-0"
              >
                {r.type === "case_study" ? (
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {r.status && (
                    <Badge variant="outline" className={`text-[10px] ${statusStyles[r.status].cls}`}>
                      {statusStyles[r.status].label}
                    </Badge>
                  )}
                  {(r.creatorTypes ? sortCreatorTypes(r.creatorTypes) : []).slice(0, 2).map(t => {
                    const c = getCreatorTypeColor(t);
                    return (
                      <span key={t} className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold capitalize" style={{ backgroundColor: `${c}22`, color: c }}>
                        {t}
                      </span>
                    );
                  })}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
