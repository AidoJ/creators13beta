import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Plus, Video, Clock, Repeat, Send, Trash2, X, Users, UserPlus, Mail, CheckCircle, Bell, XCircle, Edit, CircleDot, ChevronDown, CalendarClock, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface TrainingCall {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link: string | null;
  recurrence_rule: string;
  recurrence_end_date: string | null;
  cancelled: boolean;
  created_at: string;
}

interface Invitee {
  id: string;
  email: string;
  name: string | null;
  user_id: string | null;
  invited_at: string;
}

interface CallEvent {
  id: string;
  call_id: string;
  event_type: string;
  details: string | null;
  created_at: string;
}

interface PractitionerOption {
  user_id: string;
  email: string;
  name: string;
}

interface TrainingCallManagerProps {
  onCallsChanged?: () => void;
}

export default function TrainingCallManager({ onCallsChanged }: TrainingCallManagerProps) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<TrainingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

   // Practitioner list for invitee selection
  const [practitioners, setPractitioners] = useState<PractitionerOption[]>([]);
  const [practLoading, setPractLoading] = useState(false);

  // Invitees and events per call
  const [inviteesByCall, setInviteesByCall] = useState<Record<string, Invitee[]>>({});
  const [eventsByCall, setEventsByCall] = useState<Record<string, CallEvent[]>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [zoomLink, setZoomLink] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Invitee selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [newExternalEmail, setNewExternalEmail] = useState("");

  const fetchInvitees = useCallback(async (callIds: string[]) => {
    if (callIds.length === 0) return;
    const [{ data: invData }, { data: evtData }] = await Promise.all([
      supabase.from("training_call_invitees").select("id, call_id, email, name, user_id, invited_at").in("call_id", callIds).order("invited_at", { ascending: true }),
      supabase.from("training_call_events").select("id, call_id, event_type, details, created_at").in("call_id", callIds).not("event_type", "eq", "reminder_sent_email").order("created_at", { ascending: true }),
    ]);
    const groupedInv: Record<string, Invitee[]> = {};
    (invData || []).forEach((row: any) => {
      if (!groupedInv[row.call_id]) groupedInv[row.call_id] = [];
      groupedInv[row.call_id].push(row);
    });
    setInviteesByCall(groupedInv);
    const groupedEvt: Record<string, CallEvent[]> = {};
    (evtData || []).forEach((row: any) => {
      if (!groupedEvt[row.call_id]) groupedEvt[row.call_id] = [];
      groupedEvt[row.call_id].push(row);
    });
    setEventsByCall(groupedEvt);
  }, []);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("training_calls")
      .select("*")
      .order("scheduled_at", { ascending: true });
    const callsList = (data as TrainingCall[]) || [];
    setCalls(callsList);
    setLoading(false);
    // Fetch invitees for all calls
    const ids = callsList.map(c => c.id);
    fetchInvitees(ids);
  }, [fetchInvitees]);

  const fetchPractitioners = useCallback(async () => {
    setPractLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["practitioner", "trainee"]);
    if (!roles || roles.length === 0) { setPractLoading(false); return; }
    const userIds = [...new Set(roles.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name")
      .in("user_id", userIds);
    const list: PractitionerOption[] = (profiles || []).map(p => ({
      user_id: p.user_id,
      email: p.email || "",
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "Unknown",
    })).filter(p => p.email);
    setPractitioners(list);
    // Default: select all
    setSelectedUserIds(new Set(list.map(p => p.user_id)));
    setPractLoading(false);
  }, []);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  useEffect(() => {
    if (showForm && practitioners.length === 0) fetchPractitioners();
  }, [showForm, practitioners.length, fetchPractitioners]);

  function resetForm() {
    setTitle(""); setDescription(""); setDate(""); setTime("");
    setDuration("60"); setZoomLink(""); setRecurrence("none"); setRecurrenceEnd("");
    setExternalEmails([]); setNewExternalEmail("");
    setShowForm(false);
  }

  function toggleUser(userId: string) {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function selectAll() {
    setSelectedUserIds(new Set(practitioners.map(p => p.user_id)));
  }

  function selectNone() {
    setSelectedUserIds(new Set());
  }

  function addExternalEmail() {
    const email = newExternalEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (externalEmails.includes(email)) {
      toast({ title: "Email already added", variant: "destructive" });
      return;
    }
    setExternalEmails(prev => [...prev, email]);
    setNewExternalEmail("");
  }

  function removeExternalEmail(email: string) {
    setExternalEmails(prev => prev.filter(e => e !== email));
  }

  async function handleCreate() {
    if (!title.trim() || !date || !time || !user) return;
    if (selectedUserIds.size === 0 && externalEmails.length === 0) {
      toast({ title: "Select at least one invitee", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const scheduledAt = new Date(`${date}T${time}`).toISOString();

    const callsToCreate: Array<{ title: string; description: string | null; scheduled_at: string; duration_minutes: number; zoom_link: string | null; recurrence_rule: string; recurrence_end_date?: string | null; created_by: string }> = [];
    
    if (recurrence === "none") {
      callsToCreate.push({
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(duration),
        zoom_link: zoomLink.trim() || null,
        recurrence_rule: "none",
        created_by: user.id,
      });
    } else {
      const intervals: Record<string, number> = { weekly: 7, fortnightly: 14, monthly: 30 };
      const intervalDays = intervals[recurrence] || 7;
      const endDate = recurrenceEnd ? new Date(recurrenceEnd) : new Date(Date.now() + 90 * 86400000);
      const startDate = new Date(`${date}T${time}`);
      
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        callsToCreate.push({
          title: title.trim(),
          description: description.trim() || null,
          scheduled_at: currentDate.toISOString(),
          duration_minutes: parseInt(duration),
          zoom_link: zoomLink.trim() || null,
          recurrence_rule: recurrence,
          recurrence_end_date: recurrenceEnd || null,
          created_by: user.id,
        });
        if (recurrence === "monthly") {
          currentDate = new Date(currentDate);
          currentDate.setMonth(currentDate.getMonth() + 1);
        } else {
          currentDate = new Date(currentDate.getTime() + intervalDays * 86400000);
        }
      }
    }

    const { data: insertedCalls, error } = await supabase.from("training_calls").insert(callsToCreate).select("id");

    if (error) {
      toast({ title: "Error creating call", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Training call${callsToCreate.length > 1 ? "s" : ""} created`, description: `${callsToCreate.length} session${callsToCreate.length > 1 ? "s" : ""} scheduled.` });

      // Record created events
      if (insertedCalls) {
        await supabase.from("training_call_events").insert(
          insertedCalls.map((c: any) => ({ call_id: c.id, event_type: "created", details: "Training call scheduled" }))
        );
      }

      // Build recipient lists
      const selectedPractitionerUserIds = Array.from(selectedUserIds);

      // Send invites for every created call (important for recurring series)
      if (insertedCalls && insertedCalls.length > 0) {
        for (let idx = 0; idx < insertedCalls.length; idx++) {
          const inserted = insertedCalls[idx];
          const callForInvite = {
            ...callsToCreate[Math.min(idx, callsToCreate.length - 1)],
            id: inserted.id,
          };
          await sendInvites(callForInvite, selectedPractitionerUserIds, externalEmails);
        }
      }
      resetForm();
      await fetchCalls();
      onCallsChanged?.();
    }
    setSubmitting(false);
  }

  async function sendInvites(call: Record<string, any>, practitionerUserIds?: string[], externalGuestEmails?: string[]) {
    setSending(call.id || "new");
    try {
      const { data, error } = await supabase.functions.invoke("send-training-invite", {
        body: {
          callId: call.id || "",
          title: call.title,
          description: call.description,
          scheduledAt: call.scheduled_at,
          durationMinutes: call.duration_minutes,
          zoomLink: call.zoom_link,
          recurrenceRule: call.recurrence_rule,
          practitionerUserIds: practitionerUserIds || [],
          externalEmails: externalGuestEmails || [],
        },
      });
      if (error) throw error;
      const failedCount = data?.failed || 0;
      const sentCount = data?.sent || 0;
      if (failedCount > 0) {
        toast({
          title: "Some invites failed",
          description: `${sentCount} sent, ${failedCount} failed: ${(data?.errors || []).join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Invites sent!", description: `${sentCount} email${sentCount !== 1 ? "s" : ""} sent.` });
      }
      if (call.id) {
        await fetchInvitees([call.id]);
      }
    } catch (err: any) {
      toast({ title: "Error sending invites", description: err.message, variant: "destructive" });
    }
    setSending(null);
  }

  async function handleResendAll(call: TrainingCall) {
    const currentInvitees = inviteesByCall[call.id] || [];
    if (currentInvitees.length === 0) {
      toast({ title: "No invitees found", description: "Add invitees first, then resend." , variant: "destructive" });
      return;
    }

    const practitionerUserIds = Array.from(
      new Set(currentInvitees.filter((inv) => !!inv.user_id).map((inv) => inv.user_id as string))
    );
    const externalGuestEmails = Array.from(
      new Set(currentInvitees.filter((inv) => !inv.user_id).map((inv) => inv.email.toLowerCase()))
    );

    await sendInvites(call, practitionerUserIds, externalGuestEmails);
  }

  async function handleSendTestEmail() {
    const email = testEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Invalid email", description: "Enter a valid test email address.", variant: "destructive" });
      return;
    }

    setSendingTestEmail(true);
    try {
      const referenceCall = calls.find((c) => !c.cancelled && new Date(c.scheduled_at) >= new Date()) || calls.find((c) => !c.cancelled);
      const scheduledAt = referenceCall?.scheduled_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase.functions.invoke("send-training-invite", {
        body: {
          title: referenceCall?.title || "Training Call Test",
          description: referenceCall?.description || "This is a test training call email sent from the Trainer panel.",
          scheduledAt,
          durationMinutes: referenceCall?.duration_minutes || 60,
          zoomLink: referenceCall?.zoom_link || "",
          recurrenceRule: referenceCall?.recurrence_rule || "none",
          practitionerUserIds: [],
          externalEmails: [email],
        },
      });

      if (error) throw error;

      const failedCount = data?.failed || 0;
      if (failedCount > 0) {
        toast({
          title: "Test email failed",
          description: (data?.errors || []).join(", "),
          variant: "destructive",
        });
      } else {
        toast({ title: "Test email sent", description: `Delivered via training invite template to ${email}.` });
      }
    } catch (err: any) {
      toast({ title: "Error sending test email", description: err.message, variant: "destructive" });
    }
    setSendingTestEmail(false);
  }

  async function handleCancel(id: string) {
    const { error } = await supabase.from("training_calls").update({ cancelled: true }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("training_call_events").insert({ call_id: id, event_type: "cancelled", details: "Call cancelled" });
      // Notify invitees
      try {
        await supabase.functions.invoke("send-training-update", {
          body: { callId: id, updateType: "cancelled" },
        });
      } catch (e) { console.error("Error sending cancel notifications:", e); }
      toast({ title: "Call cancelled", description: "All invitees have been notified." });
      await fetchCalls();
      onCallsChanged?.();
    }
  }

  async function handleReschedule(id: string, newDate: string, newTime: string) {
    const call = calls.find(c => c.id === id);
    if (!call) return;
    const previousScheduledAt = call.scheduled_at;
    const newScheduledAt = new Date(`${newDate}T${newTime}`).toISOString();

    const updatePayload: { scheduled_at: string; title?: string } = { scheduled_at: newScheduledAt };
    if (call.title.startsWith("[DUPLICATE]")) {
      updatePayload.title = call.title.replace(/^\[DUPLICATE\]\s*/, '');
    }
    const { error } = await supabase.from("training_calls").update(updatePayload).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("training_call_events").insert({ call_id: id, event_type: "updated", details: `Rescheduled from ${new Date(previousScheduledAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` });
    // Notify invitees
    try {
      await supabase.functions.invoke("send-training-update", {
        body: { callId: id, updateType: "rescheduled", previousScheduledAt },
      });
    } catch (e) { console.error("Error sending reschedule notifications:", e); }
    toast({ title: "Call rescheduled", description: "All invitees have been notified." });
    await fetchCalls();
    onCallsChanged?.();
  }

  // Duplicate dialog state
  const [duplicateSource, setDuplicateSource] = useState<TrainingCall | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicateTime, setDuplicateTime] = useState("");

  function openDuplicateDialog(id: string) {
    const call = calls.find(c => c.id === id);
    if (!call) return;
    const dt = new Date(call.scheduled_at);
    setDuplicateTitle(call.title.replace(/^\[DUPLICATE\]\s*/, ''));
    setDuplicateDate(dt.toISOString().slice(0, 10));
    setDuplicateTime(dt.toTimeString().slice(0, 5));
    setDuplicateSource(call);
  }

  async function handleDuplicate() {
    if (!duplicateSource || !user || !duplicateDate || !duplicateTime) return;
    const newScheduledAt = new Date(`${duplicateDate}T${duplicateTime}`).toISOString();
    const { data, error } = await supabase.from("training_calls").insert({
      title: duplicateTitle.trim() || duplicateSource.title.replace(/^\[DUPLICATE\]\s*/, ''),
      description: duplicateSource.description,
      scheduled_at: newScheduledAt,
      duration_minutes: duplicateSource.duration_minutes,
      zoom_link: duplicateSource.zoom_link,
      recurrence_rule: "none",
      created_by: user.id,
    }).select("id").single();
    if (error) {
      toast({ title: "Error duplicating call", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("training_call_events").insert({ call_id: data.id, event_type: "created", details: `Duplicated from "${duplicateSource.title}"` });
      toast({ title: "Call duplicated", description: `Scheduled for ${new Date(newScheduledAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}.` });
      setDuplicateSource(null);
      await fetchCalls();
      onCallsChanged?.();
    }
  }

  async function handleDelete(id: string) {
    const { error: inviteesError } = await supabase.from("training_call_invitees").delete().eq("call_id", id);
    if (inviteesError) {
      toast({ title: "Error", description: inviteesError.message, variant: "destructive" });
      return;
    }

    const { error: eventsError } = await supabase.from("training_call_events").delete().eq("call_id", id);
    if (eventsError) {
      toast({ title: "Error", description: eventsError.message, variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("training_calls").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Call deleted" });
      await fetchCalls();
      onCallsChanged?.();
    }
  }

  const upcomingCalls = calls.filter(c => !c.cancelled && new Date(c.scheduled_at) >= new Date());
  const pastCalls = calls.filter(c => !c.cancelled && new Date(c.scheduled_at) < new Date());
  const cancelledCalls = calls.filter(c => c.cancelled);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Training Calls
        </h2>
        <Button size="sm" onClick={() => setShowForm(true)} className="rounded-full">
          <Plus className="h-3.5 w-3.5 mr-1" /> Schedule Call
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">Email Delivery Test</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="trainer-test@example.com"
            className="sm:max-w-sm"
          />
          <Button size="sm" onClick={handleSendTestEmail} disabled={sendingTestEmail}>
            <Mail className="h-3.5 w-3.5 mr-1" />
            {sendingTestEmail ? "Sending…" : "Send Test Email"}
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">New Training Call</h3>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly Training Session" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional agenda or notes…" rows={2} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Time *</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Zoom Link</label>
              <Input value={zoomLink} onChange={e => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Recurrence</label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-off</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrence !== "none" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Repeat until</label>
                <Input type="date" value={recurrenceEnd} onChange={e => setRecurrenceEnd(e.target.value)} />
              </div>
            )}
          </div>

          {/* Invitee selection */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                Select Invitees
              </h4>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAll}>Select All</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectNone}>Deselect All</Button>
              </div>
            </div>

            {/* Practitioner checkboxes */}
            {practLoading ? (
              <p className="text-xs text-muted-foreground">Loading practitioners…</p>
            ) : practitioners.length === 0 ? (
              <p className="text-xs text-muted-foreground">No practitioners found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-border p-2 bg-muted/20">
                {practitioners.map(p => (
                  <label key={p.user_id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedUserIds.has(p.user_id)}
                      onCheckedChange={() => toggleUser(p.user_id)}
                    />
                    <div className="min-w-0">
                      <span className="text-foreground text-xs font-medium truncate block">{p.name}</span>
                      <span className="text-muted-foreground text-[10px] truncate block">{p.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {selectedUserIds.size} of {practitioners.length} practitioners selected
            </p>

            {/* External email invites */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                External Guests
              </h4>
              <div className="flex gap-2">
                <Input
                  value={newExternalEmail}
                  onChange={e => setNewExternalEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="text-xs h-8"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addExternalEmail(); } }}
                />
                <Button variant="outline" size="sm" className="h-8 text-xs flex-shrink-0" onClick={addExternalEmail}>
                  <Plus className="h-3 w-3 mr-0.5" /> Add
                </Button>
              </div>
              {externalEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {externalEmails.map(email => (
                    <Badge key={email} variant="secondary" className="text-[10px] gap-1 pr-1">
                      <Mail className="h-2.5 w-2.5" />
                      {email}
                      <button onClick={() => removeExternalEmail(email)} className="ml-0.5 hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={!title.trim() || !date || !time || (selectedUserIds.size === 0 && externalEmails.length === 0) || submitting} className="rounded-full">
              <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? "Creating…" : `Create & Send (${selectedUserIds.size + externalEmails.length})`}
            </Button>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Upcoming calls */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading calls…</div>
      ) : upcomingCalls.length === 0 && pastCalls.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          No training calls scheduled yet. Click "Schedule Call" to create one.
        </div>
      ) : (
        <>
          {upcomingCalls.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</h3>
              {upcomingCalls.map(call => (
                <CallCard key={call.id} call={call} onCancel={handleCancel} onDelete={handleDelete} onDuplicate={openDuplicateDialog} onReschedule={handleReschedule} onResend={handleResendAll} sending={sending === call.id} practitioners={practitioners} onSendInvites={sendInvites} onLoadPractitioners={fetchPractitioners} practLoading={practLoading} invitees={inviteesByCall[call.id] || []} events={eventsByCall[call.id] || []} onInvitesSent={() => fetchInvitees(calls.map(c => c.id))} />
              ))}
            </div>
          )}
          {pastCalls.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past</h3>
              {pastCalls.slice(0, 10).map(call => (
                <CallCard key={call.id} call={call} onCancel={handleCancel} onDelete={handleDelete} onDuplicate={openDuplicateDialog} onResend={handleResendAll} sending={sending === call.id} past invitees={inviteesByCall[call.id] || []} events={eventsByCall[call.id] || []} />
              ))}
            </div>
          )}
          {cancelledCalls.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer">Cancelled ({cancelledCalls.length})</summary>
              <div className="space-y-2 mt-2">
                {cancelledCalls.map(call => (
                  <CallCard key={call.id} call={call} onCancel={handleCancel} onDelete={handleDelete} onDuplicate={openDuplicateDialog} onResend={handleResendAll} sending={false} cancelled invitees={inviteesByCall[call.id] || []} events={eventsByCall[call.id] || []} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* Duplicate Dialog */}
      <Dialog open={!!duplicateSource} onOpenChange={(open) => { if (!open) setDuplicateSource(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-primary" />
              Duplicate Call
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Edit the title and choose the date &amp; time for the duplicated call.
            </p>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={duplicateTitle} onChange={e => setDuplicateTitle(e.target.value)} className="mt-1" placeholder="Call title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={duplicateDate} onChange={e => setDuplicateDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Input type="time" value={duplicateTime} onChange={e => setDuplicateTime(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDuplicateSource(null)}>Cancel</Button>
            <Button size="sm" disabled={!duplicateDate || !duplicateTime} onClick={handleDuplicate}>
              <Copy className="h-3 w-3 mr-1" />Duplicate Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CallCard({ call, onCancel, onDelete, onDuplicate, onReschedule, onResend, sending, past, cancelled, practitioners, onSendInvites, onLoadPractitioners, practLoading, invitees, events, onInvitesSent }: {
  call: TrainingCall;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onReschedule?: (id: string, newDate: string, newTime: string) => void;
  onResend: (call: TrainingCall) => void;
  sending: boolean;
  past?: boolean;
  cancelled?: boolean;
  practitioners?: PractitionerOption[];
  onSendInvites?: (call: Record<string, any>, practitionerUserIds?: string[], externalGuestEmails?: string[]) => Promise<void>;
  onLoadPractitioners?: () => void;
  practLoading?: boolean;
  invitees?: Invitee[];
  events?: CallEvent[];
  onInvitesSent?: () => void;
}) {
  const [showInviteMore, setShowInviteMore] = useState(false);
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [addExternalEmails, setAddExternalEmails] = useState<string[]>([]);
  const [addNewEmail, setAddNewEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const dt = new Date(call.scheduled_at);
  const dateStr = dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

  function handleOpenInviteMore() {
    setShowInviteMore(true);
    if (practitioners && practitioners.length === 0 && onLoadPractitioners) onLoadPractitioners();
  }

  function toggleAddUser(userId: string) {
    setAddSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function handleAddEmail() {
    const email = addNewEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (addExternalEmails.includes(email)) return;
    setAddExternalEmails(prev => [...prev, email]);
    setAddNewEmail("");
  }

  async function handleSendAdditional() {
    if (!onSendInvites || (addSelectedIds.size === 0 && addExternalEmails.length === 0)) return;
    setInviteSending(true);
    await onSendInvites(call, Array.from(addSelectedIds), addExternalEmails);
    setInviteSending(false);
    setShowInviteMore(false);
    setAddSelectedIds(new Set());
    setAddExternalEmails([]);
    setAddNewEmail("");
    onInvitesSent?.();
  }

  return (
    <div className={`rounded-xl border bg-card p-4 space-y-3 ${cancelled ? "opacity-50 border-border" : past ? "border-border" : "border-primary/20"}`}>
      <div className="space-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-foreground text-sm">
              {call.title.replace(/^\[DUPLICATE\]\s*/, '')}
              {call.title.startsWith("[DUPLICATE]") && (
                <span className="text-yellow-300 font-normal not-italic ml-1.5 bg-black px-1.5 py-0.5 rounded text-[10px]">(Cloned)</span>
              )}
            </h4>
            {call.recurrence_rule !== "none" && (
              <Badge variant="outline" className="text-[10px]">
                <Repeat className="h-2.5 w-2.5 mr-0.5" />
                {call.recurrence_rule}
              </Badge>
            )}
            {cancelled && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Cancelled</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dateStr}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeStr}</span>
            <span>{call.duration_minutes}min</span>
          </div>
          {call.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{call.description}</p>}
          {/* Invitee list */}
          {invitees && invitees.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              {invitees.slice(0, 6).map(inv => (
                <Badge key={inv.id} variant="secondary" className="text-[10px] py-0 h-5">
                  {inv.name || inv.email}
                </Badge>
              ))}
              {invitees.length > 6 && (
                <span className="text-[10px] text-muted-foreground">+{invitees.length - 6} more</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {call.zoom_link && (
            <a href={call.zoom_link} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="h-7 text-xs bg-[hsl(var(--zoom-blue))] text-primary-foreground hover:bg-[hsl(var(--zoom-blue))]/90"><Video className="h-3 w-3 mr-1" />Zoom</Button>
            </a>
          )}
          {!past && !cancelled && (
            <>
              <Button size="sm" className="h-7 text-xs bg-orange-500 text-white hover:bg-orange-600" onClick={() => {
                const dt = new Date(call.scheduled_at);
                setRescheduleDate(dt.toISOString().slice(0, 10));
                setRescheduleTime(dt.toTimeString().slice(0, 5));
                setShowReschedule(true);
              }}>
                <CalendarClock className="h-3 w-3 mr-1" />Reschedule
              </Button>
              <Button size="sm" className="h-7 text-xs bg-green-600 text-white hover:bg-green-700" onClick={handleOpenInviteMore}>
                <UserPlus className="h-3 w-3 mr-1" />Invite More
              </Button>
              <Button size="sm" className="h-7 text-xs bg-yellow-500 text-white hover:bg-yellow-600" onClick={() => onResend(call)} disabled={sending}>
                <Send className="h-3 w-3 mr-1" />{sending ? "Sending…" : "Resend All"}
              </Button>
              {onDuplicate && (
                <Button size="sm" className="h-7 text-xs bg-blue-900 text-white hover:bg-blue-950" onClick={() => onDuplicate(call.id)}>
                  <Copy className="h-3 w-3 mr-1" />Duplicate
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="h-7 text-xs bg-red-600 text-white hover:bg-red-700">
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this training call?</AlertDialogTitle>
                    <AlertDialogDescription>All invitees will be notified by email that this call has been cancelled.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Call</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onCancel(call.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel Call</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this call?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove this training call.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(call.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Timeline */}
      {(() => {
        const hasEvents = events && events.length > 0;
        const eventCount = hasEvents ? events.length : 1;
        return (
          <Collapsible className="border-t border-border pt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2 py-1.5 h-auto text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/50 group">
                <span className="flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3" /> Timeline ({eventCount})
                </span>
                <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 ml-1.5 border-l-2 border-border pl-3 space-y-1.5">
              {hasEvents ? events.map(evt => {
                const evtDate = new Date(evt.created_at);
                const icon = evt.event_type === "created" ? <Plus className="h-3 w-3 text-primary" /> :
                  evt.event_type === "invites_sent" ? <Send className="h-3 w-3 text-primary" /> :
                  evt.event_type === "reminder_sent" ? <Bell className="h-3 w-3 text-amber-500" /> :
                  evt.event_type === "cancelled" ? <XCircle className="h-3 w-3 text-destructive" /> :
                  evt.event_type === "completed" ? <CheckCircle className="h-3 w-3 text-green-600" /> :
                  evt.event_type === "updated" ? <Edit className="h-3 w-3 text-muted-foreground" /> :
                  <CircleDot className="h-3 w-3 text-muted-foreground" />;
                const label = evt.event_type === "created" ? "Created" :
                  evt.event_type === "invites_sent" ? "Invites Sent" :
                  evt.event_type === "reminder_sent" ? "Reminder Sent" :
                  evt.event_type === "cancelled" ? "Cancelled" :
                  evt.event_type === "completed" ? "Completed" :
                  evt.event_type === "updated" ? "Updated" : evt.event_type;
                return (
                  <div key={evt.id} className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">{icon}</div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground">{label}</span>
                      {evt.details && <span className="text-[10px] text-muted-foreground ml-1.5">— {evt.details}</span>}
                      <p className="text-[10px] text-muted-foreground">{evtDate.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0"><Plus className="h-3 w-3 text-primary" /></div>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-foreground">Scheduled</span>
                    <p className="text-[10px] text-muted-foreground">{new Date(call.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              )}
              {past && !cancelled && !(hasEvents && events.some(e => e.event_type === "completed")) && (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0"><CheckCircle className="h-3 w-3 text-green-600" /></div>
                  <div>
                    <span className="text-xs font-medium text-foreground">Completed</span>
                    <p className="text-[10px] text-muted-foreground">Session time has passed</p>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })()}

      {/* Inline invite-more panel */}
      {showInviteMore && (
        <div className="border-t border-border pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-primary" />
              Add Invitees to This Call
            </h4>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowInviteMore(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* Practitioner pick list */}
          {practLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (practitioners || []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No practitioners found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-36 overflow-y-auto rounded-lg border border-border p-2 bg-muted/20">
              {(practitioners || []).map(p => (
                <label key={p.user_id} className="flex items-center gap-2 p-1 rounded-md hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox checked={addSelectedIds.has(p.user_id)} onCheckedChange={() => toggleAddUser(p.user_id)} />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          )}

          {/* External emails */}
          <div className="flex gap-2">
            <Input
              value={addNewEmail}
              onChange={e => setAddNewEmail(e.target.value)}
              placeholder="guest@example.com"
              className="text-xs h-7"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddEmail(); } }}
            />
            <Button variant="outline" size="sm" className="h-7 text-[10px] flex-shrink-0" onClick={handleAddEmail}>
              <Plus className="h-2.5 w-2.5 mr-0.5" />Add
            </Button>
          </div>
          {addExternalEmails.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {addExternalEmails.map(email => (
                <Badge key={email} variant="secondary" className="text-[10px] gap-1 pr-1">
                  <Mail className="h-2.5 w-2.5" />{email}
                  <button onClick={() => setAddExternalEmails(prev => prev.filter(e => e !== email))} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                </Badge>
              ))}
            </div>
          )}

          <Button size="sm" className="rounded-full h-7 text-xs" disabled={inviteSending || (addSelectedIds.size === 0 && addExternalEmails.length === 0)} onClick={handleSendAdditional}>
            <Send className="h-3 w-3 mr-1" />{inviteSending ? "Sending…" : `Send Invite (${addSelectedIds.size + addExternalEmails.length})`}
          </Button>
        </div>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Reschedule: {call.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              All invitees will be notified of the new date &amp; time by email.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">New Date</Label>
                <Input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">New Time</Label>
                <Input type="time" value={rescheduleTime} onChange={e => setRescheduleTime(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowReschedule(false)}>Cancel</Button>
            <Button size="sm" disabled={!rescheduleDate || !rescheduleTime} onClick={() => {
              onReschedule?.(call.id, rescheduleDate, rescheduleTime);
              setShowReschedule(false);
            }}>
              <CalendarClock className="h-3 w-3 mr-1" />Reschedule &amp; Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
