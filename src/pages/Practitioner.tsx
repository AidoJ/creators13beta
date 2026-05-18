import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ClientList from "@/components/practitioner/ClientList";
import ClientDetail from "@/components/practitioner/ClientDetail";
import CaseStudyForm from "@/components/practitioner/CaseStudyForm";
import CaseStudyList from "@/components/practitioner/CaseStudyList";
import ReferenceChartsPanel from "@/components/practitioner/ReferenceChartsPanel";
import CompositePhotoLayout from "@/components/profiling/CompositePhotoLayout";
import InviteClientForm from "@/components/practitioner/InviteClientForm";
import CaseStudyPipeline from "@/components/practitioner/CaseStudyPipeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowLeft, Users, ClipboardList, Copy, CheckCircle, UserPlus, FolderOpen, BarChart3, Gauge, HelpCircle, Calendar } from "lucide-react";
import ResourceLibrary from "@/components/practitioner/ResourceLibrary";
import { toast } from "@/hooks/use-toast";
import FAQPanel from "@/components/practitioner/FAQPanel";
import TrainingCalendar from "@/components/practitioner/TrainingCalendar";
import CaseStudySearch from "@/components/shared/CaseStudySearch";

export default function PractitionerDashboard() {
  const { user, signOut } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState("");
  const [showCaseStudy, setShowCaseStudy] = useState(false);
  const [editingCaseStudy, setEditingCaseStudy] = useState<any>(null);
  const [practitionerCode, setPractitionerCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [searchFilterCaseStudyId, setSearchFilterCaseStudyId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [clientHasCaseStudy, setClientHasCaseStudy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("practitioner_code")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.practitioner_code) setPractitionerCode(data.practitioner_code);
      });
  }, [user]);

  // Check if selected client already has a case study from this practitioner
  useEffect(() => {
    if (!selectedClientId || !user) { setClientHasCaseStudy(false); return; }
    supabase
      .from("case_studies")
      .select("id")
      .eq("practitioner_id", user.id)
      .eq("subject_user_id", selectedClientId)
      .limit(1)
      .then(({ data }) => setClientHasCaseStudy(!!(data && data.length > 0)));
  }, [selectedClientId, user]);

  function handleSelectClient(clientId: string) {
    setSelectedClientId(clientId);
    setShowCaseStudy(false);
    setEditingCaseStudy(null);
  }

  function handleStartCaseStudy(clientId: string, clientName: string) {
    setSelectedClientId(clientId);
    setSelectedClientName(clientName);
    setShowCaseStudy(true);
    setEditingCaseStudy(null);
    setActiveTab("clients");
  }

  function handleEditCaseStudy(caseStudy: any) {
    setSelectedClientId(caseStudy.subject_user_id);
    setSelectedClientName(caseStudy.subject_name || "Client");
    setEditingCaseStudy(caseStudy);
    setShowCaseStudy(true);
    // Don't switch tabs — stay on current tab (cases)
  }

  function handleCopyCode() {
    if (practitionerCode) {
      navigator.clipboard.writeText(practitionerCode);
      setCodeCopied(true);
      toast({ title: "Copied!", description: "Practitioner code copied to clipboard." });
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={user?.email} onSignOut={signOut} />

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Practitioner Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage clients, create assessments, and access training resources.</p>
          </div>

          <CaseStudySearch
            onSelectCaseStudy={async (id) => {
              // Always try to open the client file when selecting a case study search hit
              const { data } = await supabase
                .from("case_studies")
                .select("subject_user_id")
                .eq("id", id)
                .maybeSingle();

              if (data?.subject_user_id) {
                setSearchFilterCaseStudyId(null);
                handleSelectClient(data.subject_user_id);
                setActiveTab("clients");
                return;
              }

              // Fallback if legacy case study has no linked subject
              setSearchFilterCaseStudyId(id);
              setActiveTab("cases");
              toast({
                title: "Client file unavailable",
                description: "This case study is not linked to a client profile yet, so we opened the case study record instead.",
              });
            }}
            onSelectClient={(clientId) => {
              setSearchFilterCaseStudyId(null);
              handleSelectClient(clientId);
              setActiveTab("clients");
            }}
          />

          {/* Practitioner code display */}
          {practitionerCode && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
              <span className="text-xs text-muted-foreground">Your Referral Code:</span>
              <span className="font-mono font-bold text-primary text-sm tracking-wider">{practitionerCode}</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCopyCode}>
                {codeCopied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pipeline"><Gauge className="h-3.5 w-3.5 mr-1" />Pipeline</TabsTrigger>
            <TabsTrigger value="calendar"><Calendar className="h-3.5 w-3.5 mr-1" />Calendar</TabsTrigger>
            <TabsTrigger value="clients"><Users className="h-3.5 w-3.5 mr-1" />Clients</TabsTrigger>
            <TabsTrigger value="invitations"><UserPlus className="h-3.5 w-3.5 mr-1" />Invite</TabsTrigger>
            <TabsTrigger value="cases"><ClipboardList className="h-3.5 w-3.5 mr-1" />Case Studies</TabsTrigger>
            <TabsTrigger value="resources"><FolderOpen className="h-3.5 w-3.5 mr-1" />Resources</TabsTrigger>
            <TabsTrigger value="charts"><BarChart3 className="h-3.5 w-3.5 mr-1" />Charts</TabsTrigger>
            <TabsTrigger value="faqs"><HelpCircle className="h-3.5 w-3.5 mr-1" />FAQs</TabsTrigger>
          </TabsList>

          {/* ======= PIPELINE TAB ======= */}
          <TabsContent value="pipeline" className="mt-4 space-y-6">
            <TrainingCalendar compact />
            <CaseStudyPipeline
              onSelectClient={(clientId) => {
                handleSelectClient(clientId);
                setActiveTab("clients");
              }}
              onStartCaseStudy={handleStartCaseStudy}
              onFilterByStatus={(status) => {
                setFilterStatus(status);
                setSearchFilterCaseStudyId(null);
                setActiveTab("cases");
              }}
            />
          </TabsContent>

          {/* ======= CALENDAR TAB ======= */}
          <TabsContent value="calendar" className="mt-4">
            <TrainingCalendar />
          </TabsContent>

          {/* ======= CLIENTS TAB ======= */}
          <TabsContent value="clients" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <ClientList onSelectClient={handleSelectClient} selectedClientId={selectedClientId} />
              </div>
              <div id="client-detail-panel" className="lg:col-span-2 space-y-4">
                {selectedClientId ? (
                  <>
                    {!showCaseStudy ? (
                      <>
                        <ClientDetail clientId={selectedClientId} onClientNameLoaded={setSelectedClientName} />
                        {!clientHasCaseStudy && (
                          <Button variant="outline" onClick={() => setShowCaseStudy(true)} className="w-full">
                            <FileText className="h-4 w-4 mr-2" />
                            Create Case Study for {selectedClientName || "this client"}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setShowCaseStudy(false); setEditingCaseStudy(null); }} className="text-xs">
                          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Client Detail
                        </Button>
                        <CompositePhotoLayout userId={selectedClientId} subjectName={`${selectedClientName}'s Profiling Photos`} showReclassify />
                        <CaseStudyForm
                          clientId={selectedClientId}
                          clientName={selectedClientName}
                          onSaved={() => { setShowCaseStudy(false); setEditingCaseStudy(null); }}
                          existingCaseStudy={editingCaseStudy || undefined}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <Users className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-muted-foreground">Select a client from the list to view their profiling details and create assessments.</p>
                      {practitionerCode && (
                        <p className="text-xs text-muted-foreground">
                          Share your referral code <span className="font-mono font-bold text-primary">{practitionerCode}</span> with new clients to have them automatically linked to you.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ======= INVITATIONS TAB ======= */}
          <TabsContent value="invitations" className="mt-4">
            <InviteClientForm practitionerCode={practitionerCode} />
          </TabsContent>

          {/* ======= CASE STUDIES TAB ======= */}
          <TabsContent value="cases" className="mt-4">
            {showCaseStudy && editingCaseStudy && selectedClientId ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => { setShowCaseStudy(false); setEditingCaseStudy(null); }} className="text-xs">
                  <ArrowLeft className="h-3 w-3 mr-1" /> Back to Case Study List
                </Button>
                <CompositePhotoLayout userId={selectedClientId} subjectName={`${selectedClientName}'s Profiling Photos`} showReclassify />
                <CaseStudyForm
                  clientId={selectedClientId}
                  clientName={selectedClientName}
                  onSaved={() => { setShowCaseStudy(false); setEditingCaseStudy(null); }}
                  existingCaseStudy={editingCaseStudy}
                />
              </div>
            ) : (
              user && <CaseStudyList practitionerId={user.id} onEditCaseStudy={handleEditCaseStudy} filterCaseStudyId={searchFilterCaseStudyId} filterStatus={filterStatus} onClearFilter={() => { setSearchFilterCaseStudyId(null); setFilterStatus(null); }} />
            )}
          </TabsContent>

          {/* ======= RESOURCES TAB ======= */}
          <TabsContent value="resources" className="mt-4">
            <ResourceLibrary />
          </TabsContent>

          {/* ======= REFERENCE CHARTS TAB ======= */}
          <TabsContent value="charts" className="mt-4">
            <ReferenceChartsPanel />
          </TabsContent>

          {/* ======= FAQs TAB ======= */}
          <TabsContent value="faqs" className="mt-4">
            <FAQPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
