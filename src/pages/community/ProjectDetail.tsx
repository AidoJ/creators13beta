import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatures } from "@/hooks/useFeatures";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, ExternalLink, FolderKanban, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ProjectForm, { MemberOption } from "@/components/projects/ProjectForm";
import { Project, formatDuration, signedThumbnailUrl } from "@/lib/projects";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground whitespace-pre-wrap">{children}</div>
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { has, ready } = useFeatures();
  const [project, setProject] = useState<Project | null>(null);
  const [coCreators, setCoCreators] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [thumb, setThumb] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const canView = has("projects_view") || isAdmin;
  const canAddEdit = has("projects_add_edit") || isAdmin;

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const [projRes, ccRes, memberRes, adminRes] = await Promise.all([
      supabase.from("projects" as any).select("*").eq("id", projectId).maybeSingle(),
      supabase.from("project_co_creators" as any).select("user_id").eq("project_id", projectId),
      supabase.rpc("get_project_member_options" as any),
      supabase.rpc("has_role", { _user_id: user?.id, _role: "admin" as any }),
    ]);
    if (projRes.error) {
      toast({ title: "Couldn't load project", description: projRes.error.message, variant: "destructive" });
    }
    const p = (projRes.data as unknown as Project) || null;
    setProject(p);
    setCoCreators(((ccRes.data || []) as any[]).map((r) => r.user_id));
    setMembers(
      (((memberRes.data || []) as any[]) || []).map((m) => ({
        user_id: m.user_id,
        display_name: m.display_name || "Member",
      }))
    );
    setIsAdmin(!!adminRes.data);
    setThumb(await signedThumbnailUrl(p?.thumbnail_url ?? null));
    setLoading(false);
  }

  // Standalone admin check so the view gate (which includes admins) can resolve.
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" as any })
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!user || !ready || !canView) { if (ready && !canView) setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, canView, projectId]);

  const isCreator = !!project && project.creator_id === user?.id;
  const isEditor = isCreator || (!!user && coCreators.includes(user.id));
  const canEdit = (isEditor && canAddEdit) || isAdmin;
  const canDelete = isCreator || isAdmin;

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Member";

  async function handleDelete() {
    if (!project) return;
    const { error } = await supabase.from("projects" as any).delete().eq("id", project.id);
    if (error) {
      toast({ title: "Couldn't delete project", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Project deleted" });
    navigate("/community/projects");
  }

  if (ready && !canView) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <p className="text-sm text-muted-foreground">Your current membership doesn't include the Projects space yet.</p>
          <Button variant="outline" onClick={() => navigate("/community/dashboard")}>Back to Community</Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading project…</div>;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <p className="text-sm text-muted-foreground">This project couldn't be found.</p>
          <Button variant="outline" onClick={() => navigate("/community/projects")}>All projects</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/community/projects")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Projects
          </Button>
          <div className="flex gap-2">
            {canEdit && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-1">
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                    <AlertDialogDescription>This removes the project for everyone. It can't be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {thumb ? (
          <img src={thumb} alt={project.name} className="w-full h-56 object-cover rounded-lg border border-border" />
        ) : (
          <div className="w-full h-56 rounded-lg bg-muted flex items-center justify-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}

        <h1 className="text-2xl font-display text-foreground">{project.name}</h1>

        <Card className="p-5 space-y-4">
          <Field label="Project Creator">{nameOf(project.creator_id)}</Field>
          <Field label="Co-Creators">
            {coCreators.length ? coCreators.map(nameOf).join(", ") : "None"}
          </Field>
          <Field label="Origin/Location">{project.location_label}</Field>
          <Field label="Proximity">{project.proximity}</Field>
          {project.url && (
            <Field label="Project URL">
              <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 underline">
                {project.url} <ExternalLink className="h-3 w-3" />
              </a>
            </Field>
          )}
          <Field label="Description">{project.description}</Field>
          <Field label="Start Date">{new Date(project.start_date).toLocaleDateString()}</Field>
          <Field label="Duration">{formatDuration(project.duration_value, project.duration_unit)}</Field>
          <Field label="Funding Status"><Badge variant="outline">{project.funding_status}</Badge></Field>
          <Field label="Seeking Creator Types">
            {project.seeking_creator_types.length ? project.seeking_creator_types.join(", ") : "—"}
          </Field>
          <Field label="Seeking Team Roles">
            {project.seeking_team_roles.length ? project.seeking_team_roles.join(", ") : "—"}
          </Field>
          <Field label="Seeking Skills">{project.seeking_skills || "—"}</Field>
          <Field label="Other Project Information">{project.other_info || "—"}</Field>
        </Card>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            project={project}
            coCreatorIds={coCreators}
            members={members}
            onCancel={() => setEditing(false)}
            onSaved={() => { setEditing(false); load(); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
