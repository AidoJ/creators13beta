import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Shield, ChevronDown, ChevronUp, FileText, CheckCircle, Clock, BarChart3, Eye, EyeOff, FolderOpen, Save, HelpCircle, Briefcase, CreditCard, Mail, Send, UserPlus, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ClientDetail from "@/components/practitioner/ClientDetail";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CreateUserForm from "@/components/admin/CreateUserForm";
import ResourceUploadPanel from "@/components/admin/ResourceUploadPanel";
import FAQManagerPanel from "@/components/admin/FAQManagerPanel";
import PractitionersTab from "@/components/admin/PractitionersTab";
import SubscribersTab from "@/components/admin/SubscribersTab";
import EmailTemplateEditor from "@/components/admin/EmailTemplateEditor";
import InvitationsManager from "@/components/admin/InvitationsManager";
import { capitaliseTypeName } from "@/lib/creatorTypes";


type AppRole = Database["public"]["Enums"]["app_role"];
type EnrollmentStep = Database["public"]["Enums"]["enrollment_step"];
type CaseStudyStatus = Database["public"]["Enums"]["case_study_status"];

const ALL_ROLES: AppRole[] = ["trainer", "admin", "practitioner", "trainee", "client", "community_participant", "gamer"];

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

interface AssignmentRow {
  id: string;
  client_id: string;
  practitioner_id: string;
  client_name: string;
  practitioner_name: string;
  active: boolean;
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudyRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [photoCounts, setPhotoCounts] = useState<{ user_id: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [addingRole, setAddingRole] = useState<{ userId: string; role: AppRole } | null>(null);
  const [activeTab, setActiveTab] = useState("practitioners");
  const [expandedCaseStudy, setExpandedCaseStudy] = useState<string | null>(null);
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});
  const [cohortFilter, setCohortFilter] = useState<string>("all");
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
    roles.forEach(r => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    const subMap: Record<string, { tier: string; status: string }> = {};
    subs.forEach(s => { subMap[s.user_id] = { tier: s.tier, status: s.status }; });

    setUsers(profiles.map(p => ({
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      enrollment_step: p.enrollment_step,
      practitioner_code: p.practitioner_code,
      practitioner_status: (p as any).practitioner_status || null,
      training_started_at: (p as any).training_started_at || null,
      roles: roleMap[p.user_id] || [],
      tier: subMap[p.user_id]?.tier || null,
      sub_status: subMap[p.user_id]?.status || null,
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
      id: d.id,
      title: d.title,
      status: d.status as CaseStudyStatus,
      practitioner_id: d.practitioner_id,
      practitioner_name: nameMap[d.practitioner_id] || "Unknown",
      subject_name: d.subject_user_id ? (nameMap[d.subject_user_id] || "Unknown") : "—",
      subject_user_id: d.subject_user_id,
      creator_types_identified: d.creator_types_identified,
      description: d.description,
      profiling_notes: d.profiling_notes,
      reviewer_notes: (d as any).reviewer_notes || null,
      form_data: (d.form_data && typeof d.form_data === 'object' && !Array.isArray(d.form_data)) ? d.form_data as Record<string, any> : null,
      body_drawing_path: d.body_drawing_path,
      created_at: d.created_at,
    })));
  }, []);

  const fetchAssignments = useCallback(async () => {
    const { data } = await supabase.from("client_practitioner").select("id, client_id, practitioner_id, active");
    if (!data) return;

    const userIds = [...new Set([...data.map(d => d.client_id), ...data.map(d => d.practitioner_id)])];
    const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds);
    const nameMap: Record<string, string> = {};
    (profiles || []).forEach(p => { nameMap[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown"; });

    setAssignments(data.map(d => ({
      id: d.id,
      client_id: d.client_id,
      practitioner_id: d.practitioner_id,
      client_name: nameMap[d.client_id] || "Unknown",
      practitioner_name: nameMap[d.practitioner_id] || "Unknown",
      active: d.active ?? true,
    })));
  }, []);

  const fetchPhotoCounts = useCallback(async () => {
    const { data } = await supabase.from("profiling_photos").select("user_id");
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach(p => { counts[p.user_id] = (counts[p.user_id] || 0) + 1; });
    setPhotoCounts(Object.entries(counts).map(([user_id, count]) => ({ user_id, count })));
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchCaseStudies(), fetchAssignments(), fetchPhotoCounts()]);
      setLoading(false);
    }
    init();
  }, [fetchUsers, fetchCaseStudies, fetchAssignments, fetchPhotoCounts]);

  async function handleAddRole(userId: string, role: AppRole) {
    setAddingRole({ userId, role });
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role added", description: `Added ${role} role.` });
      await fetchUsers();
    }
    setAddingRole(null);
  }

  async function handleRemoveRole(userId: string, role: AppRole) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role removed" });
      await fetchUsers();
    }
  }

  async function handleCaseStudyAction(id: string, action: "approved" | "revision_requested", notes?: string) {
    const updateData: { status: "approved" | "revision_requested"; reviewed_by?: string; reviewed_at: string; reviewer_notes?: string } = {
      status: action,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    };
    // Always save reviewer_notes if provided (for both approve and revision)
    if (notes) {
      updateData.reviewer_notes = notes;
    }
    const { error } = await supabase.from("case_studies").update(updateData).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Auto-sync creator types to client profile on approval
      if (action === "approved") {
        const { data: cs } = await supabase.from("case_studies").select("subject_user_id, creator_types_identified").eq("id", id).maybeSingle();
        if (cs?.subject_user_id && cs.creator_types_identified && cs.creator_types_identified.length > 0) {
          const types = cs.creator_types_identified.map(capitaliseTypeName);
          await supabase.from("creator_type_profiles").upsert({
            user_id: cs.subject_user_id,
            primary_type: types[0] || null,
            secondary_type: types[1] || null,
            type_3: types[2] || null,
            type_4: types[3] || null,
            profiled_by: user?.id ?? null,
            profiled_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          // Mark enrollment as complete
          await supabase.from("profiles").update({ enrollment_step: "complete" }).eq("user_id", cs.subject_user_id);
        }
      }
      toast({ title: action === "approved" ? "Case study approved" : "Revision requested with notes" });
      setRevisionNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
      await fetchCaseStudies();
    }
  }

  async function handlePractitionerStatus(userId: string, status: string) {
    const { error } = await supabase.from("profiles").update({ practitioner_status: status as Database["public"]["Enums"]["practitioner_status"] }).eq("user_id", userId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status updated", description: `Set to ${status.replace(/_/g, " ")}` });
      await fetchUsers();
    }
  }

  // Assign client to practitioner
  const [assignClient, setAssignClient] = useState("");
  const [assignPrac, setAssignPrac] = useState("");

  async function handleAssign() {
    if (!assignClient || !assignPrac) return;
    const { error } = await supabase.from("client_practitioner").insert({
      client_id: assignClient,
      practitioner_id: assignPrac,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Client assigned" });
      setAssignClient("");
      setAssignPrac("");
      await fetchAssignments();
    }
  }

  // Compute unique cohort options
  const cohortOptions = Array.from(new Set(
    users.filter(u => u.training_started_at).map(u => {
      const d = new Date(u.training_started_at!);
      return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    })
  )).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const nameMatch = !search || `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.practitioner_code || "").toLowerCase().includes(q);
    const cohortMatch = cohortFilter === "all" || (cohortFilter === "unassigned" ? !u.training_started_at : (u.training_started_at && new Date(u.training_started_at).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) === cohortFilter));
    return nameMatch && cohortMatch;
  });

  const stepLabel = (step: string | null) => step ? step.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—";

  // Pipeline stats
  const totalUsers = users.length;
  const byStep: Record<string, number> = {};
  users.forEach(u => { const s = u.enrollment_step || "none"; byStep[s] = (byStep[s] || 0) + 1; });
  const practitionerCount = users.filter(u => u.roles.includes("practitioner")).length;
  const traineeCount = users.filter(u => u.roles.includes("trainee")).length;
  const pendingCaseStudies = caseStudies.filter(c => c.status === "submitted").length;
  const draftCaseStudies = caseStudies.filter(c => c.status === "draft").length;
  const totalCaseStudies = caseStudies.length;

  const practitioners = users.filter(u => u.roles.includes("practitioner") || u.roles.includes("trainee") || u.roles.includes("trainer"));
  const clients = users.filter(u => u.roles.includes("client"));

  // Build maps: client_id → practitioner name & code (from active assignments)
  const assignedPracMap: Record<string, string> = {};
  const assignedPracCodeMap: Record<string, string> = {};
  const pracCodeLookup: Record<string, string> = {};
  users.forEach(u => { if (u.practitioner_code) pracCodeLookup[u.user_id] = u.practitioner_code; });
  assignments.filter(a => a.active).forEach(a => {
    assignedPracMap[a.client_id] = a.practitioner_name;
    assignedPracCodeMap[a.client_id] = pracCodeLookup[a.practitioner_id] || "";
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader email={user?.email} onSignOut={signOut} />

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Admin Panel</h1>

        {/* Pipeline stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Users", value: totalUsers, icon: Users },
            { label: "Practitioners", value: practitionerCount, icon: Shield },
            { label: "Trainees", value: traineeCount, icon: Shield },
            { label: "Pending Reviews", value: pendingCaseStudies, icon: FileText },
            { label: "Total Case Studies", value: totalCaseStudies, icon: FileText },
            { label: "Completed Enrollment", value: byStep["complete"] || 0, icon: CheckCircle },
            { label: "In Progress", value: totalUsers - (byStep["complete"] || 0), icon: Clock },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
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
                <div className="text-xs text-muted-foreground capitalize">{step.replace(/_/g, " ")}</div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${totalUsers > 0 ? ((byStep[step] || 0) / totalUsers) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
           <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="practitioners"><Briefcase className="h-3.5 w-3.5 mr-1" />Practitioners</TabsTrigger>
            <TabsTrigger value="subscribers"><CreditCard className="h-3.5 w-3.5 mr-1" />Subscribers</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />All Users</TabsTrigger>
            <TabsTrigger value="resources"><FolderOpen className="h-3.5 w-3.5 mr-1" />Resources</TabsTrigger>
            <TabsTrigger value="faqs"><HelpCircle className="h-3.5 w-3.5 mr-1" />FAQs</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="h-3.5 w-3.5 mr-1" />Emails</TabsTrigger>
            <TabsTrigger value="invitations"><Send className="h-3.5 w-3.5 mr-1" />Invitations</TabsTrigger>
          </TabsList>

          {/* ======= PRACTITIONERS TAB ======= */}
          <TabsContent value="practitioners" className="space-y-4">
            <PractitionersTab
              users={users}
              caseStudies={caseStudies}
              assignments={assignments}
              photoCounts={photoCounts}
              onViewCaseStudy={(caseStudyId) => {
                setActiveTab("cases");
                setExpandedCaseStudy(caseStudyId);
              }}
            />
          </TabsContent>

          {/* ======= SUBSCRIBERS TAB ======= */}
          <TabsContent value="subscribers" className="space-y-4">
            <SubscribersTab users={users} caseStudies={caseStudies} assignedPracMap={assignedPracMap} />
          </TabsContent>

          {/* ======= ALL USERS TAB ======= */}
          <TabsContent value="users" className="space-y-4">
            <CreateUserForm onCreated={fetchUsers} />
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name, email, or practitioner code…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={cohortFilter} onValueChange={setCohortFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by cohort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cohorts</SelectItem>
                  {cohortOptions.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Tier</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Cohort</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Enrollment</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Roles</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Prac Code</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Assigned To</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
                    ) : filtered.map(u => (
                      <UserTableRow key={u.user_id} user={u} isExpanded={expandedUser === u.user_id}
                        onToggle={() => setExpandedUser(expandedUser === u.user_id ? null : u.user_id)}
                        onAddRole={handleAddRole} onRemoveRole={handleRemoveRole} addingRole={addingRole} stepLabel={stepLabel}
                        onStatusChange={handlePractitionerStatus} onRefresh={fetchUsers}
                        assignedPractitioner={assignedPracMap[u.user_id] || null}
                        assignedPracCode={assignedPracCodeMap[u.user_id] || null}
                        practitioners={practitioners}
                        currentPracId={assignments.find(a => a.client_id === u.user_id && a.active)?.practitioner_id || null}
                        onViewFile={(userId) => { setViewingClientId(userId); setViewingClientName(`${u.first_name || ""} ${u.last_name || ""}`.trim() || "Client"); }}
                        onAssignPractitioner={async (clientId, pracId) => {
                          // Deactivate existing active assignments
                          const existing = assignments.filter(a => a.client_id === clientId && a.active);
                          for (const a of existing) {
                            await supabase.from("client_practitioner").update({ active: false }).eq("id", a.id);
                          }
                          // Insert new assignment
                          const { error } = await supabase.from("client_practitioner").insert({ client_id: clientId, practitioner_id: pracId });
                          if (error) {
                            toast({ title: "Error", description: error.message, variant: "destructive" });
                          } else {
                            toast({ title: "Practitioner assigned" });
                            await Promise.all([fetchAssignments(), fetchUsers()]);
                          }
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>


          {/* ======= RESOURCES TAB ======= */}
          <TabsContent value="resources" className="space-y-4">
            <ResourceUploadPanel />
          </TabsContent>

          {/* ======= FAQs TAB ======= */}
          <TabsContent value="faqs" className="space-y-4">
            <FAQManagerPanel />
          </TabsContent>

          {/* ======= EMAILS TAB ======= */}
          <TabsContent value="emails" className="space-y-4">
            <EmailTemplateEditor />
          </TabsContent>

          {/* ======= INVITATIONS TAB ======= */}
          <TabsContent value="invitations" className="space-y-4">
            <InvitationsManager />
          </TabsContent>
        </Tabs>

        {/* Client File Sheet */}
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


function UserTableRow({ user: u, isExpanded, onToggle, onAddRole, onRemoveRole, addingRole, stepLabel, onStatusChange, onRefresh, assignedPractitioner, assignedPracCode, practitioners, currentPracId, onViewFile, onAssignPractitioner }: {
  user: UserRow; isExpanded: boolean; onToggle: () => void;
  onAddRole: (userId: string, role: AppRole) => void;
  onRemoveRole: (userId: string, role: AppRole) => void;
  addingRole: { userId: string; role: AppRole } | null;
  stepLabel: (s: string | null) => string;
  onStatusChange: (userId: string, status: string) => void;
  onRefresh: () => void;
  assignedPractitioner: string | null;
  assignedPracCode: string | null;
  practitioners: UserRow[];
  currentPracId: string | null;
  onViewFile: (userId: string) => void;
  onAssignPractitioner: (clientId: string, pracId: string) => Promise<void>;
}) {
  const [selectedRole, setSelectedRole] = useState<AppRole | "">("");
  const [trainingDate, setTrainingDate] = useState(u.training_started_at || "");
  const availableRoles = ALL_ROLES.filter(r => !u.roles.includes(r));
  const isPractitioner = u.roles.includes("practitioner") || u.roles.includes("trainee");

  // Editable profile fields
  const [editFirst, setEditFirst] = useState(u.first_name || "");
  const [editLast, setEditLast] = useState(u.last_name || "");
  const [editEmail, setEditEmail] = useState(u.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [assignPracId, setAssignPracId] = useState(currentPracId || "");
  const [assigning, setAssigning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const cohortLabel = u.training_started_at
    ? new Date(u.training_started_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
    : null;

  const statusColors: Record<string, string> = {
    in_progress: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    paused: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
    certified: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  async function handleSaveTrainingDate() {
    const { error } = await supabase.from("profiles").update({ training_started_at: trainingDate || null } as any).eq("user_id", u.user_id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Training date updated" });
      onRefresh();
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: {
        target_user_id: u.user_id,
        updates: { first_name: editFirst, last_name: editLast, email: editEmail },
      },
    });
    setSavingProfile(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      onRefresh();
    }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast({ title: "Password too weak", description: "Must include uppercase, lowercase, a number, and a special character (e.g. !@#$%).", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: { target_user_id: u.user_id, new_password: newPassword },
    });
    setSavingPassword(false);
    if (error || data?.error) {
      const msg = data?.error || error?.message || "";
      const isHibp = /password/.test(msg.toLowerCase()) || /hibp|breach|leaked|pwned/.test(msg.toLowerCase());
      const description = isHibp
        ? "This password has been found in a data breach and cannot be used. Please choose a stronger, unique password with uppercase, lowercase, numbers, and special characters."
        : msg;
      toast({ title: "Password reset failed", description, variant: "destructive" });
    } else {
      toast({ title: "Password reset successfully" });
      setNewPassword("");
    }
  }

  return (
    <>
      <tr className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 font-medium text-foreground">{u.first_name || "—"} {u.last_name || ""}</td>
        <td className="px-4 py-2.5 text-muted-foreground text-xs">{u.email || "—"}</td>
        <td className="px-4 py-2.5">
          {u.tier ? <Badge variant="secondary" className="text-[10px] capitalize">{u.tier}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5">
          {cohortLabel ? <Badge variant="outline" className="text-[10px]">{cohortLabel}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5">
          <Badge variant="outline" className="text-[10px] capitalize">{stepLabel(u.enrollment_step)}</Badge>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {u.roles.length > 0 ? u.roles.map(r => {
              const isPracRole = r === "practitioner" || r === "trainee";
              if (isPracRole && u.practitioner_status) {
                const pracBadgeColors: Record<string, string> = {
                  certified: "bg-green-500 text-white border-green-600",
                  in_progress: "bg-orange-500 text-white border-orange-600",
                  cancelled: "bg-red-500 text-white border-red-600",
                  paused: "bg-blue-500 text-white border-blue-600",
                };
                return (
                  <Badge key={r} variant="outline" className={`text-[10px] capitalize ${pracBadgeColors[u.practitioner_status] || ""}`}>
                    {r.replace(/_/g, " ")}
                  </Badge>
                );
              }
              return <Badge key={r} variant="secondary" className="text-[10px] capitalize">{r.replace(/_/g, " ")}</Badge>;
            }) : <span className="text-[10px] text-muted-foreground">No roles</span>}
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{u.practitioner_code || assignedPracCode || "—"}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">{assignedPractitioner || "—"}</td>
        <td className="px-4 py-2.5">
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={9} className="px-4 py-4">
            <div className="space-y-4">
              {/* Edit Profile Details */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Edit Profile</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">First Name</label>
                    <Input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="h-8 text-xs" onClick={e => e.stopPropagation()} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Last Name</label>
                    <Input value={editLast} onChange={e => setEditLast(e.target.value)} className="h-8 text-xs" onClick={e => e.stopPropagation()} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Email</label>
                    <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-8 text-xs" onClick={e => e.stopPropagation()} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-7 text-xs" disabled={savingProfile} onClick={e => { e.stopPropagation(); handleSaveProfile(); }}>
                    <Save className="h-3 w-3 mr-1" />{savingProfile ? "Saving…" : "Save Profile"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={e => { e.stopPropagation(); onViewFile(u.user_id); }}>
                    <ExternalLink className="h-3 w-3 mr-1" />View File
                  </Button>
                </div>
              </div>

              {/* Password Reset */}
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium text-foreground">Reset Password</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      className="h-8 text-xs pr-8"
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={e => { e.stopPropagation(); setShowPassword(!showPassword); }}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={savingPassword || !newPassword} onClick={e => { e.stopPropagation(); handleResetPassword(); }}>
                    {savingPassword ? "Resetting…" : "Reset Password"}
                  </Button>
                </div>
              </div>

              {/* Manage Roles */}
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs font-medium text-foreground">Manage Roles</p>
                <div className="flex flex-wrap gap-2">
                  {u.roles.map(role => (
                    <Button key={role} variant="outline" size="sm" className="text-xs h-7 capitalize"
                      onClick={e => { e.stopPropagation(); onRemoveRole(u.user_id, role); }}>
                      ✕ {role.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
                {availableRoles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedRole} onValueChange={v => setSelectedRole(v as AppRole)}>
                      <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Add role…" /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map(r => (
                          <SelectItem key={r} value={r} className="capitalize text-xs">{r.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 text-xs" disabled={!selectedRole || addingRole?.userId === u.user_id}
                      onClick={e => { e.stopPropagation(); if (selectedRole) { onAddRole(u.user_id, selectedRole as AppRole); setSelectedRole(""); } }}>
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Practitioner certification status */}
              {isPractitioner && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs font-medium text-foreground">Certification Status</p>
                  <div className="flex items-center gap-2">
                    {u.practitioner_status && (
                      <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[u.practitioner_status] || ""}`}>
                        {u.practitioner_status.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <Select
                      value={u.practitioner_status || ""}
                      onValueChange={v => onStatusChange(u.user_id, v)}
                    >
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue placeholder="Set status…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                        <SelectItem value="paused" className="text-xs">Paused</SelectItem>
                        <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                        <SelectItem value="certified" className="text-xs">Certified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Training cohort date */}
                  <div className="pt-2 space-y-1">
                    <p className="text-xs font-medium text-foreground">Training Cohort (Start Date)</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="month"
                        value={trainingDate ? trainingDate.slice(0, 7) : ""}
                        onChange={e => setTrainingDate(e.target.value ? `${e.target.value}-01` : "")}
                        className="w-44 h-8 text-xs"
                      />
                      <Button size="sm" className="h-8 text-xs" onClick={e => { e.stopPropagation(); handleSaveTrainingDate(); }}>
                        <Save className="h-3 w-3 mr-1" />Save
                      </Button>
                      {cohortLabel && <Badge variant="outline" className="text-[10px]">{cohortLabel}</Badge>}
                    </div>
                  </div>
                </div>
              )}

              {/* Assign Practitioner */}
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1"><UserPlus className="h-3 w-3" />Assign Practitioner</p>
                <div className="flex items-center gap-2">
                  {assignedPractitioner && (
                    <span className="text-xs text-muted-foreground">Currently: <strong>{assignedPractitioner}</strong>{assignedPracCode ? ` (${assignedPracCode})` : ""}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={assignPracId} onValueChange={v => setAssignPracId(v)}>
                    <SelectTrigger className="w-64 h-8 text-xs" onClick={e => e.stopPropagation()}>
                      <SelectValue placeholder="Select practitioner…" />
                    </SelectTrigger>
                    <SelectContent>
                      {practitioners
                        .filter(p => p.user_id !== u.user_id)
                        .sort((a, b) => `${a.first_name || ""} ${a.last_name || ""}`.localeCompare(`${b.first_name || ""} ${b.last_name || ""}`))
                        .map(p => (
                          <SelectItem key={p.user_id} value={p.user_id} className="text-xs">
                            {`${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown"}{p.practitioner_code ? ` (${p.practitioner_code})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!assignPracId || assignPracId === currentPracId || assigning}
                    onClick={async e => {
                      e.stopPropagation();
                      setAssigning(true);
                      await onAssignPractitioner(u.user_id, assignPracId);
                      setAssigning(false);
                    }}
                  >
                    {assigning ? "Assigning…" : currentPracId ? "Reassign" : "Assign"}
                  </Button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}