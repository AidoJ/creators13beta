import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, XCircle, Clock, BarChart3, Eye, EyeOff, GitBranch, Save, Calendar, ArrowLeft, Mail, Scissors } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CompositePhotoLayout from "@/components/profiling/CompositePhotoLayout";
import CaseStudyFormDataView from "@/components/admin/CaseStudyFormDataView";
import BodyOutlineSVG from "@/components/practitioner/BodyOutlineSVG";
import CreatorTypeEditor from "@/components/admin/CreatorTypeEditor";
import { getCreatorTypeColor, sortCreatorTypes, capitaliseTypeName } from "@/lib/creatorTypes";
import TrainingCallManager from "@/components/trainer/TrainingCallManager";
import TrainingCalendar from "@/components/practitioner/TrainingCalendar";
import CaseStudySearch from "@/components/shared/CaseStudySearch";
import InvitationsManager from "@/components/admin/InvitationsManager";
import FaceSplitMirror from "@/components/trainer/FaceSplitMirror";
import BodyAnnotationTool from "@/components/trainer/BodyAnnotationTool";
import ClientDetail from "@/components/practitioner/ClientDetail";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type AppRole = Database["public"]["Enums"]["app_role"];
type EnrollmentStep = Database["public"]["Enums"]["enrollment_step"];
type CaseStudyStatus = Database["public"]["Enums"]["case_study_status"];

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enrollment_step: EnrollmentStep | null;
  practitioner_code: string | null;
  practitioner_status: string | null;
  training_started_at: string | null;
  roles: AppRole[];
  tier: string | null;
  sub_status: string | null;
}

interface CaseStudyRow {
  id: string;
  title: string;
  status: CaseStudyStatus;
  practitioner_id: string;
  practitioner_name: string;
  subject_name: string;
  subject_user_id: string | null;
  creator_types_identified: string[] | null;
  description: string | null;
  profiling_notes: string | null;
  reviewer_notes: string | null;
  form_data: Record<string, any> | null;
  body_drawing_path: string | null;
  created_at: string;
}

export default function TrainerDashboard() {
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [trainingRefreshKey, setTrainingRefreshKey] = useState(0);
  const [expandedCaseStudy, setExpandedCaseStudy] = useState<string | null>(null);
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});
  const [searchFilterId, setSearchFilterId] = useState<string | null>(null);
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<string | null>(null);
  const [pipelinePractitionerFilter, setPipelinePractitionerFilter] = useState<string | null>(null);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [viewingClientName, setViewingClientName] = useState<string>("");

  const fetchUsers = useCallback(async () => {
    const [profilesRes, rolesRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, first_name, last_name, email, enrollment_step, practitioner_code, practitioner_status, training_started_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("subscriptions").select("user_id, tier, status"),
    ]);
    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const subs = subsRes.data || [];
    const roleMap: Record<string, AppRole[]> = {};
    roles.forEach(r => { if (!roleMap[r.user_id]) roleMap[r.user_id] = []; roleMap[r.user_id].push(r.role); });
    const subMap: Record<string, { tier: string; status: string }> = {};
    subs.forEach(s => { subMap[s.user_id] = { tier: s.tier, status: s.status }; });
    setUsers(profiles.map(p => ({
      user_id: p.user_id, first_name: p.first_name, last_name: p.last_name, email: p.email,
      enrollment_step: p.enrollment_step, practitioner_code: p.practitioner_code,
      practitioner_status: (p as any).practitioner_status || null,
      training_started_at: (p as any).training_started_at || null,
      roles: roleMap[p.user_id] || [], tier: subMap[p.user_id]?.tier || null, sub_status: subMap[p.user_id]?.status || null,
    })));
  }, []);

  const fetchCaseStudies = useCallback(async () => {
    const { data } = await supabase.from("case_studies")
      .select("id, title, status, practitioner_id, subject_user_id, creator_types_identified, description, profiling_notes, reviewer_notes, form_data, body_drawing_path, created_at")
      .order("created_at", { ascending: false });
    if (!data) return;
    const userIds = [...new Set([...data.map(d => d.practitioner_id), ...data.filter(d => d.subject_user_id).map(d => d.subject_user_id!)])];
    const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
    const nameMap: Record<string, string> = {};
    (profiles || []).forEach(p => { nameMap[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown"; });
    setCaseStudies(data.map(d => ({
      id: d.id, title: d.title, status: d.status as CaseStudyStatus, practitioner_id: d.practitioner_id,
      practitioner_name: nameMap[d.practitioner_id] || "Unknown",
      subject_name: d.subject_user_id ? (nameMap[d.subject_user_id] || "Unknown") : "—",
      subject_user_id: d.subject_user_id, creator_types_identified: d.creator_types_identified,
      description: d.description, profiling_notes: d.profiling_notes,
      reviewer_notes: (d as any).reviewer_notes || null,
      form_data: (d.form_data && typeof d.form_data === 'object' && !Array.isArray(d.form_data)) ? d.form_data as Record<string, any> : null,
      body_drawing_path: d.body_drawing_path, created_at: d.created_at,
    })));
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchCaseStudies()]);
      setLoading(false);
    }
    init();
  }, [fetchUsers, fetchCaseStudies]);

  async function handleCaseStudyAction(id: string, action: "approved" | "revision_requested", notes?: string) {
    const updateData: { status: "approved" | "revision_requested"; reviewed_by?: string; reviewed_at: string; reviewer_notes?: string } = {
      status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
    };
    if (notes) updateData.reviewer_notes = notes;
    const { error } = await supabase.from("case_studies").update(updateData).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Auto-sync creator types to client profile on approval
      if (action === "approved") {
        const { data: cs } = await supabase.from("case_studies").select("subject_user_id, creator_types_identified, practitioner_id, title").eq("id", id).maybeSingle();
        if (cs?.subject_user_id && cs.creator_types_identified && cs.creator_types_identified.length > 0) {
          const types = cs.creator_types_identified.map(capitaliseTypeName);
          const { error: upsertErr } = await supabase.from("creator_type_profiles").upsert({
            user_id: cs.subject_user_id,
            primary_type: types[0] || null,
            secondary_type: types[1] || null,
            type_3: types[2] || null,
            type_4: types[3] || null,
            profiled_by: user?.id ?? null,
            profiled_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (upsertErr) {
            console.error("Failed to sync creator types:", upsertErr);
            toast({ title: "Warning", description: "Case study approved but creator types failed to sync: " + upsertErr.message, variant: "destructive" });
          }
          // Mark enrollment as complete
          const { error: stepErr } = await supabase.from("profiles").update({ enrollment_step: "complete" }).eq("user_id", cs.subject_user_id);
          if (stepErr) console.error("Failed to update enrollment step:", stepErr);
          // Notify client of their approved creator types
          try {
            await supabase.functions.invoke("notify-client-approved", {
              body: {
                client_user_id: cs.subject_user_id,
                primary_type: types[0] || "",
                secondary_type: types[1] || "",
              },
            });
          } catch (e) {
            console.error("Failed to notify client of approval:", e);
          }
          // Notify practitioner that their case study was approved (include feedback)
          try {
            const csLocal = caseStudies.find(c => c.id === id);
            await supabase.functions.invoke("notify-practitioner-approved", {
              body: {
                practitioner_id: cs.practitioner_id,
                client_name: csLocal?.subject_name || "Client",
                case_study_title: cs.title || "Case Study",
                creator_types: types,
                reviewer_notes: notes || "",
              },
            });
          } catch (e) {
            console.error("Failed to notify practitioner of approval:", e);
          }
        }
      }
      toast({ title: action === "approved" ? "Case study approved" : "Revision requested with notes" });
      setRevisionNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
      await fetchCaseStudies();
    }
  }

  async function handleMarkProfiled(id: string) {
    const { error } = await supabase.from("case_studies").update({ status: "draft" as any, profiling_complete: true } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Case study marked as profiled", description: "Returned to practitioner's drafts." });
      await fetchCaseStudies();
    }
  }

  const totalUsers = users.length;
  const byStep: Record<string, number> = {};
  users.forEach(u => { const s = u.enrollment_step || "none"; byStep[s] = (byStep[s] || 0) + 1; });
  const profilingCaseStudies = caseStudies.filter(c => c.status === "profiling_submitted").length;
  const pendingCaseStudies = caseStudies.filter(c => c.status === "submitted").length;
  const draftCaseStudies = caseStudies.filter(c => c.status === "draft").length;
  const totalCaseStudies = caseStudies.length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader email={user?.email} onSignOut={signOut} />
      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-display font-bold text-foreground">Trainer Panel</h1>
          <CaseStudySearch
            onSelectCaseStudy={(id) => {
              setSearchFilterId(id);
              setExpandedCaseStudy(id);
              setPipelineStatusFilter(null);
              setPipelinePractitionerFilter(null);
              setActiveTab("cases-filtered");
            }}
            onSelectClient={async (clientId) => {
              // Always open the client file sheet — works for any client,
              // whether or not they have a case study.
              const { data: prof } = await supabase
                .from("profiles")
                .select("first_name, last_name, email")
                .eq("user_id", clientId)
                .maybeSingle();
              const name = prof
                ? (`${prof.first_name || ""} ${prof.last_name || ""}`.trim() || prof.email || "Client")
                : "Client";
              setViewingClientName(name);
              setViewingClientId(clientId);
            }}
          />
        </div>

        {/* Enrollment pipeline visual */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Enrollment Pipeline</h3>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {["plan_selected", "signed_up", "payment_complete", "photos_uploaded", "booking_made", "awaiting_profiling", "complete"].map(step => (
              <div key={step} className="space-y-1">
                <div className="text-lg font-bold text-foreground">{byStep[step] || 0}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{step.replace(/_/g, " ")}</div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalUsers > 0 ? ((byStep[step] || 0) / totalUsers) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="pipeline"><GitBranch className="h-3.5 w-3.5 mr-1" />Pipeline</TabsTrigger>
            <TabsTrigger value="training-calls"><Calendar className="h-3.5 w-3.5 mr-1" />Training Calls</TabsTrigger>
            <TabsTrigger value="cases-profile"><FileText className="h-3.5 w-3.5 mr-1" />CS (Profile) {profilingCaseStudies > 0 && <Badge className="ml-1 h-5 text-[10px]" variant="secondary">{profilingCaseStudies}</Badge>}</TabsTrigger>
            <TabsTrigger value="cases-pr"><FileText className="h-3.5 w-3.5 mr-1" />CS (Approve) {pendingCaseStudies > 0 && <Badge className="ml-1 h-5 text-[10px]" variant="destructive">{pendingCaseStudies}</Badge>}</TabsTrigger>
            <TabsTrigger value="cases-dt"><FileText className="h-3.5 w-3.5 mr-1" />CS (Draft) {draftCaseStudies > 0 && <Badge className="ml-1 h-5 text-[10px]" variant="outline">{draftCaseStudies}</Badge>}</TabsTrigger>
            <TabsTrigger value="invitations"><Mail className="h-3.5 w-3.5 mr-1" />Invitations</TabsTrigger>
            <TabsTrigger value="face-split"><Scissors className="h-3.5 w-3.5 mr-1" />Face Split</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <TrainerCaseStudyPipeline
              caseStudies={caseStudies}
              users={users}
              onFilterByStatus={(status) => {
                setPipelineStatusFilter(status);
                setPipelinePractitionerFilter(null);
                setSearchFilterId(null);
                setActiveTab("cases-filtered");
              }}
              onFilterByPractitioner={(practitionerId, practitionerName) => {
                setPipelinePractitionerFilter(practitionerId);
                setPipelineStatusFilter(null);
                setSearchFilterId(null);
                setActiveTab("cases-filtered");
              }}
            />
          </TabsContent>

          <TabsContent value="training-calls" className="space-y-6">
            <TrainingCalendar refreshKey={trainingRefreshKey} />
            <TrainingCallManager onCallsChanged={() => setTrainingRefreshKey((current) => current + 1)} />
          </TabsContent>

          <TabsContent value="cases-profile" className="space-y-4">
            <CaseStudyList
              caseStudies={caseStudies.filter(c => c.status === "profiling_submitted")}
              emptyMessage="No case studies awaiting profiling."
              expandedCaseStudy={expandedCaseStudy}
              setExpandedCaseStudy={setExpandedCaseStudy}
              revisionNotes={revisionNotes}
              setRevisionNotes={setRevisionNotes}
              handleCaseStudyAction={handleCaseStudyAction}
              setCaseStudies={setCaseStudies}
              fetchCaseStudies={fetchCaseStudies}
              userId={user?.id}
              showActions={false}
              onMarkProfiled={handleMarkProfiled}
            />
          </TabsContent>

          <TabsContent value="cases-pr" className="space-y-4">
            {searchFilterId && (
              <Button variant="ghost" size="sm" className="text-xs mb-2" onClick={() => { setSearchFilterId(null); setExpandedCaseStudy(null); }}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Show all pending reviews
              </Button>
            )}
            <CaseStudyList
              caseStudies={caseStudies.filter(c => c.status === "submitted").filter(c => !searchFilterId || c.id === searchFilterId)}
              emptyMessage="No case studies pending review."
              expandedCaseStudy={expandedCaseStudy}
              setExpandedCaseStudy={setExpandedCaseStudy}
              revisionNotes={revisionNotes}
              setRevisionNotes={setRevisionNotes}
              handleCaseStudyAction={handleCaseStudyAction}
              setCaseStudies={setCaseStudies}
              fetchCaseStudies={fetchCaseStudies}
              userId={user?.id}
              showActions
            />
          </TabsContent>

          <TabsContent value="cases-dt" className="space-y-4">
            {searchFilterId && (
              <Button variant="ghost" size="sm" className="text-xs mb-2" onClick={() => { setSearchFilterId(null); setExpandedCaseStudy(null); }}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Show all drafts
              </Button>
            )}
            <CaseStudyList
              caseStudies={caseStudies.filter(c => c.status === "draft").filter(c => !searchFilterId || c.id === searchFilterId)}
              emptyMessage="No draft case studies."
              expandedCaseStudy={expandedCaseStudy}
              setExpandedCaseStudy={setExpandedCaseStudy}
              revisionNotes={revisionNotes}
              setRevisionNotes={setRevisionNotes}
              handleCaseStudyAction={handleCaseStudyAction}
              setCaseStudies={setCaseStudies}
              fetchCaseStudies={fetchCaseStudies}
              userId={user?.id}
              showActions={false}
            />
          </TabsContent>

          <TabsContent value="cases-filtered" className="space-y-4">
            <Button variant="ghost" size="sm" className="text-xs mb-2" onClick={() => { setPipelineStatusFilter(null); setPipelinePractitionerFilter(null); setSearchFilterId(null); setExpandedCaseStudy(null); setActiveTab("pipeline"); }}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Pipeline
            </Button>
            <CaseStudyList
              caseStudies={caseStudies.filter(c => {
                if (searchFilterId && c.id !== searchFilterId) return false;
                if (pipelineStatusFilter && c.status !== pipelineStatusFilter) return false;
                if (pipelinePractitionerFilter && c.practitioner_id !== pipelinePractitionerFilter) return false;
                return true;
              })}
              emptyMessage="No matching case studies."
              expandedCaseStudy={expandedCaseStudy}
              setExpandedCaseStudy={setExpandedCaseStudy}
              revisionNotes={revisionNotes}
              setRevisionNotes={setRevisionNotes}
              handleCaseStudyAction={handleCaseStudyAction}
              setCaseStudies={setCaseStudies}
              fetchCaseStudies={fetchCaseStudies}
              userId={user?.id}
              showActions
            />
          </TabsContent>

          <TabsContent value="invitations" className="space-y-4">
            <InvitationsManager />
          </TabsContent>

          <TabsContent value="face-split" className="space-y-8">
            <FaceSplitMirror />
            <div className="border-t border-border pt-6" />
            <BodyAnnotationTool />
          </TabsContent>
        </Tabs>

        {/* Client File Sheet — viewable for any client, regardless of case study */}
        <Sheet open={!!viewingClientId} onOpenChange={(open) => { if (!open) setViewingClientId(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{viewingClientName}'s File</SheetTitle>
            </SheetHeader>
            {viewingClientId && <div className="mt-4"><ClientDetail clientId={viewingClientId} /></div>}
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}

/* ---------- Shared sub-components ---------- */

function CaseStudyStatusBadge({ status }: { status: CaseStudyStatus }) {
  const map: Record<CaseStudyStatus, { label: string; class: string }> = {
    draft: { label: "Draft", class: "bg-muted/50 text-muted-foreground border-border" },
    profiling_submitted: { label: "Awaiting Profiling", class: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    submitted: { label: "Pending Review", class: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    approved: { label: "Approved", class: "bg-green-500/10 text-green-600 border-green-500/20" },
    revision_requested: { label: "Revision Needed", class: "bg-red-500/10 text-red-600 border-red-500/20" },
  };
  const s = map[status];
  return <Badge variant="outline" className={`text-[10px] ${s.class}`}>{s.label}</Badge>;
}

function CaseStudyList({ caseStudies, emptyMessage, expandedCaseStudy, setExpandedCaseStudy, revisionNotes, setRevisionNotes, handleCaseStudyAction, setCaseStudies, fetchCaseStudies, userId, showActions, onMarkProfiled }: {
  caseStudies: CaseStudyRow[];
  emptyMessage: string;
  expandedCaseStudy: string | null;
  setExpandedCaseStudy: (id: string | null) => void;
  revisionNotes: Record<string, string>;
  setRevisionNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleCaseStudyAction: (id: string, action: "approved" | "revision_requested", notes?: string) => void;
  setCaseStudies: React.Dispatch<React.SetStateAction<CaseStudyRow[]>>;
  fetchCaseStudies: () => Promise<void>;
  userId?: string;
  showActions: boolean;
  onMarkProfiled?: (id: string) => void;
}) {
  if (caseStudies.length === 0) {
    return <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {caseStudies.map(cs => {
        const isExpanded = expandedCaseStudy === cs.id;
        return (
          <div key={cs.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CaseStudyStatusBadge status={cs.status} />
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpandedCaseStudy(isExpanded ? null : cs.id)}>
                    {isExpanded ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    {isExpanded ? "Hide" : "View"}
                  </Button>
                  {showActions && cs.status === "submitted" && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => { setExpandedCaseStudy(cs.id); setRevisionNotes(prev => ({ ...prev, [cs.id]: prev[cs.id] || "" })); }}>
                        <CheckCircle className="h-3 w-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600" onClick={() => { setExpandedCaseStudy(cs.id); setRevisionNotes(prev => ({ ...prev, [cs.id]: prev[cs.id] || "" })); }}>
                        <XCircle className="h-3 w-3 mr-1" />Revise
                      </Button>
                    </>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{cs.subject_name !== "—" ? cs.subject_name : cs.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">By {cs.practitioner_name} · {new Date(cs.created_at).toLocaleDateString("en-AU")}</p>
                  {cs.creator_types_identified && cs.creator_types_identified.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sortCreatorTypes(cs.creator_types_identified).map(t => {
                        const c = getCreatorTypeColor(t);
                        return <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ backgroundColor: `${c}22`, color: c, border: `1px solid ${c}44` }}>{t}</span>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border bg-muted/20 p-4 space-y-4">
                <CreatorTypeEditor caseStudyId={cs.id} currentTypes={cs.creator_types_identified} onUpdated={(newTypes) => { setCaseStudies(prev => prev.map(c => c.id === cs.id ? { ...c, creator_types_identified: newTypes } : c)); }} />
                {cs.subject_user_id && <CompositePhotoLayout userId={cs.subject_user_id} subjectName={`${cs.subject_name}'s Profiling Photos`} showReclassify />}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Body Drawing</p>
                  <div className="relative max-w-[400px] bg-white rounded-lg border border-border overflow-hidden" style={{ aspectRatio: "400/800" }}>
                    <BodyOutlineSVG className="absolute inset-0 w-full h-full text-foreground/60 pointer-events-none z-0" />
                    {cs.body_drawing_path && (
                      <img src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/profiling-photos/${cs.body_drawing_path}`} alt="Body drawing annotations" className="absolute inset-0 w-full h-full object-contain z-10" />
                    )}
                  </div>
                  {!cs.body_drawing_path && <p className="text-[10px] text-muted-foreground italic mt-1">No annotations added yet</p>}
                </div>
                {cs.form_data ? <CaseStudyFormDataView formData={cs.form_data} /> : cs.profiling_notes ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Profiling Notes</p>
                    <div className="text-sm text-foreground whitespace-pre-wrap bg-card rounded-lg border border-border p-3 max-h-96 overflow-y-auto">{cs.profiling_notes}</div>
                  </div>
                ) : <p className="text-sm text-muted-foreground italic">No assessment notes have been added yet.</p>}
                {cs.reviewer_notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Previous Reviewer Notes</p>
                    <div className="text-sm text-foreground whitespace-pre-wrap bg-amber-500/5 rounded-lg border border-amber-500/20 p-3">{cs.reviewer_notes}</div>
                  </div>
                )}
                <div className="border-t border-border pt-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Trainer Feedback / Notes</p>
                  <Textarea value={revisionNotes[cs.id] ?? ""} onChange={e => setRevisionNotes(prev => ({ ...prev, [cs.id]: e.target.value }))} rows={4} placeholder="Provide feedback on this assessment — visible to the practitioner…" />
                  <div className="flex gap-2 flex-wrap">
                    {cs.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline" className="text-green-600 border-green-500/30" onClick={() => handleCaseStudyAction(cs.id, "approved", revisionNotes[cs.id])}>
                          <CheckCircle className="h-3 w-3 mr-1" />Approve{revisionNotes[cs.id]?.trim() ? " with Notes" : ""}
                        </Button>
                        <Button size="sm" variant="destructive" disabled={!revisionNotes[cs.id]?.trim()} onClick={() => handleCaseStudyAction(cs.id, "revision_requested", revisionNotes[cs.id])}>
                          <XCircle className="h-3 w-3 mr-1" />Request Revision
                        </Button>
                      </>
                    )}
                    {cs.status !== "submitted" && (
                      <>
                        <Button size="sm" variant="outline" disabled={!revisionNotes[cs.id]?.trim()} onClick={async () => {
                          const { error } = await supabase.from("case_studies").update({ reviewer_notes: revisionNotes[cs.id], reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", cs.id);
                          if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); } else {
                            toast({ title: "Feedback saved" }); setRevisionNotes(prev => { const n = { ...prev }; delete n[cs.id]; return n; }); await fetchCaseStudies();
                          }
                        }}>
                          <Save className="h-3 w-3 mr-1" />Save Feedback
                        </Button>
                        {cs.status === "profiling_submitted" && onMarkProfiled && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onMarkProfiled(cs.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" />Profiled
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrainerCaseStudyPipeline({ caseStudies, users, onFilterByStatus, onFilterByPractitioner }: { caseStudies: CaseStudyRow[]; users: UserRow[]; onFilterByStatus?: (status: string) => void; onFilterByPractitioner?: (practitionerId: string, practitionerName: string) => void }) {
  const practitioners = users.filter(u => u.roles.includes("practitioner") || u.roles.includes("trainee") || u.roles.includes("trainer"));
  const STAGES = [
    { key: "draft", label: "In Progress", icon: Clock, dotColor: "bg-orange-500", cardColor: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    { key: "submitted", label: "Submitted", icon: FileText, dotColor: "bg-blue-500", cardColor: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    { key: "revision_requested", label: "Needs Revision", icon: XCircle, dotColor: "bg-red-500", cardColor: "bg-red-500/10 text-red-600 border-red-500/20" },
    { key: "approved", label: "Approved", icon: CheckCircle, dotColor: "bg-green-500", cardColor: "bg-green-500/10 text-green-600 border-green-500/20" },
  ] as const;
  const byStatus: Record<string, CaseStudyRow[]> = {};
  caseStudies.forEach(cs => { if (!byStatus[cs.status]) byStatus[cs.status] = []; byStatus[cs.status].push(cs); });
  const total = caseStudies.length;
  const pracMap: Record<string, { name: string; status: string | null; cohort: string | null; counts: Record<string, number>; total: number }> = {};
  practitioners.forEach(p => {
    const cohort = p.training_started_at ? new Date(p.training_started_at).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : null;
    pracMap[p.user_id] = { name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown", status: p.practitioner_status, cohort, counts: {}, total: 0 };
  });
  caseStudies.forEach(cs => { if (pracMap[cs.practitioner_id]) { pracMap[cs.practitioner_id].counts[cs.status] = (pracMap[cs.practitioner_id].counts[cs.status] || 0) + 1; pracMap[cs.practitioner_id].total += 1; } });
  const pracStatusColors: Record<string, string> = {
    in_progress: "bg-orange-500/10 text-orange-600 border-orange-500/20", paused: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    cancelled: "bg-red-500/10 text-red-600 border-red-500/20", certified: "bg-green-500/10 text-green-600 border-green-500/20",
  };
  const cohortGroups: Record<string, typeof pracMap> = {};
  Object.entries(pracMap).filter(([, p]) => p.total > 0 || p.status).forEach(([id, p]) => { const key = p.cohort || "Unassigned"; if (!cohortGroups[key]) cohortGroups[key] = {}; cohortGroups[key][id] = p; });
  const sortedCohorts = Object.keys(cohortGroups).sort((a, b) => { if (a === "Unassigned") return 1; if (b === "Unassigned") return -1; return b.localeCompare(a); });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-display font-bold text-foreground">Global Case Study Pipeline</h2>
          <Badge variant="outline" className="ml-auto text-xs">{total} total</Badge>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          {STAGES.map(stage => { const count = byStatus[stage.key]?.length || 0; const pct = total > 0 ? (count / total) * 100 : 0; if (pct === 0) return null; return <div key={stage.key} className={`${stage.dotColor} h-full`} style={{ width: `${pct}%` }} title={`${stage.label}: ${count}`} />; })}
        </div>
         <div className="grid grid-cols-4 gap-2 mt-4">
           {STAGES.map(stage => { const count = byStatus[stage.key]?.length || 0; const StageIcon = stage.icon; return (
             <button key={stage.key} onClick={() => count > 0 && onFilterByStatus?.(stage.key)} className={`rounded-xl border p-3 text-center transition-all ${count > 0 ? `${stage.cardColor} cursor-pointer hover:opacity-80` : "bg-muted/20 text-muted-foreground/40 border-border/50"}`} disabled={count === 0}>
               <StageIcon className="h-4 w-4 mx-auto mb-1" /><div className="text-xl font-bold">{count}</div><div className="text-[10px] font-medium leading-tight">{stage.label}</div>
             </button>
          ); })}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Practitioner Progress by Cohort</h3>
        {sortedCohorts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No practitioners with case studies yet.</p> : (
          <div className="space-y-5">
            {sortedCohorts.map(cohort => (
              <div key={cohort}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs font-semibold">{cohort}</Badge>
                  <span className="text-[10px] text-muted-foreground">{Object.keys(cohortGroups[cohort]).length} member{Object.keys(cohortGroups[cohort]).length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(cohortGroups[cohort]).sort((a, b) => b[1].total - a[1].total).map(([id, p]) => (
                    <div key={id} className="flex items-center gap-3 rounded-lg bg-muted/20 border border-border px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button className="text-sm font-medium text-foreground hover:text-primary hover:underline cursor-pointer transition-colors" onClick={() => onFilterByPractitioner?.(id, p.name)}>{p.name}</button>
                          {p.status && <Badge variant="outline" className={`text-[10px] capitalize ${pracStatusColors[p.status] || ""}`}>{p.status.replace(/_/g, " ")}</Badge>}
                        </div>
                        <div className="flex gap-2 mt-1">
                          {STAGES.map(stage => { const count = p.counts[stage.key] || 0; if (count === 0) return null; return <span key={stage.key} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${stage.cardColor}`}>{stage.label}: {count}</span>; })}
                          {p.total === 0 && <span className="text-[10px] text-muted-foreground">No case studies yet</span>}
                        </div>
                      </div>
                      <span className="text-lg font-bold text-foreground">{p.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
