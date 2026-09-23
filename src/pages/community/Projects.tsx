import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatures } from "@/hooks/useFeatures";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, FolderKanban, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ProjectForm, { MemberOption } from "@/components/projects/ProjectForm";
import {
  CREATOR_TYPES,
  FUNDING_STATUSES,
  Project,
  TEAM_ROLES,
  formatDuration,
  signedThumbnailUrl,
} from "@/lib/projects";

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { has, ready } = useFeatures();
  const [projects, setProjects] = useState<Project[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [location, setLocation] = useState("");
  const [funding, setFunding] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  // The database policies allow admins as well as feature holders; mirror that here.
  const canView = has("projects_view") || isAdmin;
  const canAdd = has("projects_add_edit") || isAdmin;

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects" as any)
      .select("*")
      .order("start_date", { ascending: true });
    if (error) {
      toast({ title: "Couldn't load projects", description: error.message, variant: "destructive" });
      setProjects([]);
    } else {
      const rows = (data || []) as unknown as Project[];
      setProjects(rows);
      const entries = await Promise.all(
        rows.map(async (p) => [p.id, await signedThumbnailUrl(p.thumbnail_url)] as const)
      );
      setThumbs(Object.fromEntries(entries.filter(([, u]) => !!u) as [string, string][]));
    }
    setLoading(false);
    // The member directory only matters for tagging co-creators, so it loads after the list.
    const memberRes = await supabase.rpc("get_project_member_options" as any);
    setMembers(
      (((memberRes.data || []) as any[]) || []).map((m) => ({
        user_id: m.user_id,
        display_name: m.display_name || "Member",
      }))
    );
  }

  useEffect(() => {
    if (!user) { setIsAdmin(false); setAdminChecked(true); return; }
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" as any })
      .then(({ data }) => { setIsAdmin(!!data); setAdminChecked(true); });
  }, [user]);

  useEffect(() => {
    if (!user || !ready) return;
    if (!canView) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, canView]);

  const locations = useMemo(
    () => Array.from(new Set(projects.map((p) => p.location_label).filter(Boolean))).sort(),
    [projects]
  );

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (location && p.location_label !== location) return false;
      if (funding.length && !funding.includes(p.funding_status)) return false;
      // Plain match against what the project itself declares.
      if (types.length && !types.some((t) => p.seeking_creator_types.includes(t))) return false;
      if (roles.length && !roles.some((r) => p.seeking_team_roles.includes(r))) return false;
      return true;
    });
  }, [projects, location, funding, types, roles]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  if (ready && adminChecked && !canView) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <FolderKanban className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <h1 className="text-xl font-display">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Your current membership doesn't include the Projects space yet.
          </p>
          <Button variant="outline" onClick={() => navigate("/community/dashboard")}>Back to Community</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/community/dashboard")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Community
          </Button>
          {canAdd && (
            <Button size="sm" className="gap-1" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          )}
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Creative projects across the community — and who they're looking for.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Project Location</p>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  aria-label="Project Location"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">Any location</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold uppercase text-muted-foreground">Funding Status</legend>
                {FUNDING_STATUSES.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={funding.includes(f)} onCheckedChange={() => toggle(funding, setFunding, f)} aria-label={f} />
                    {f}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold uppercase text-muted-foreground">Seeking Creator Types</legend>
                <div className="grid grid-cols-2 gap-1">
                  {CREATOR_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={types.includes(t)} onCheckedChange={() => toggle(types, setTypes, t)} aria-label={t} />
                      {t}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold uppercase text-muted-foreground">Seeking Team Roles</legend>
                {TEAM_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggle(roles, setRoles, r)} aria-label={r} />
                    {r}
                  </label>
                ))}
              </fieldset>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setLocation(""); setFunding([]); setTypes([]); setRoles([]); }}
              >
                Clear filters
              </Button>
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">{filtered.length} of {projects.length} shown</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading projects…</p>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0 ? "No projects yet." : "No projects match these filters."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <Card
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/community/projects/${p.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") navigate(`/community/projects/${p.id}`); }}
                className="overflow-hidden cursor-pointer hover:border-primary/60 transition-colors"
              >
                {thumbs[p.id] ? (
                  <img src={thumbs[p.id]} alt={p.name} className="h-36 w-full object-cover" />
                ) : (
                  <div className="h-36 w-full bg-muted flex items-center justify-center">
                    <FolderKanban className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <h2 className="font-display text-lg leading-tight">{p.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Starts {new Date(p.start_date).toLocaleDateString()} · {formatDuration(p.duration_value, p.duration_unit)}
                  </p>
                  <Badge variant="outline">{p.funding_status}</Badge>
                  {p.seeking_creator_types.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Seeking types: </span>
                      {p.seeking_creator_types.join(", ")}
                    </p>
                  )}
                  {p.seeking_team_roles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Seeking roles: </span>
                      {p.seeking_team_roles.join(", ")}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            members={members}
            onCancel={() => setCreating(false)}
            onSaved={(id) => { setCreating(false); navigate(`/community/projects/${id}`); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
