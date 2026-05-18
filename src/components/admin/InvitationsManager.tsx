import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Trash2, Search, Mail, Loader2, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  INVITATION_STATUS_LABELS,
  getInvitationStatusLabel,
  getInvitationStatusClass,
  resolveInvitationStatuses,
} from "@/lib/invitationStatus";

interface Invitation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  practitioner_id: string;
  practitioner_name: string;
  created_at: string;
}

export default function InvitationsManager() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchInvitations();
  }, []);

  async function fetchInvitations() {
    setLoading(true);
    const { data } = await supabase
      .from("client_invitations")
      .select("id, name, email, phone, status, practitioner_id, created_at")
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const pracIds = [...new Set(data.map(d => d.practitioner_id))];
    const { data: profiles } = pracIds.length > 0
      ? await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", pracIds)
      : { data: [] };

    const nameMap: Record<string, string> = {};
    (profiles || []).forEach(p => {
      nameMap[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown";
    });

    // Look up invitee user_ids via their email so we can check for uploaded photos.
    const inviteEmails = [...new Set(data.map(d => d.email.toLowerCase()))];
    const { data: inviteeProfiles } = inviteEmails.length > 0
      ? await supabase.from("profiles").select("user_id, email").in("email", inviteEmails)
      : { data: [] };

    const emailToUserId: Record<string, string> = {};
    (inviteeProfiles || []).forEach(p => {
      if (p.email) emailToUserId[p.email.toLowerCase()] = p.user_id;
    });

    const inviteeUserIds = Object.values(emailToUserId);
    const { data: photoRows } = inviteeUserIds.length > 0
      ? await supabase.from("profiling_photos").select("user_id").in("user_id", inviteeUserIds)
      : { data: [] };

    const userIdsWithPhotos = new Set((photoRows || []).map(r => r.user_id));

    setInvitations(data.map(d => {
      let status = d.status;
      // Promote any pre-accepted status → accepted once any photos have been uploaded.
      if (["pending", "link_clicked", "account_created", "photos_pending"].includes(status)) {
        const uid = emailToUserId[d.email.toLowerCase()];
        if (uid && userIdsWithPhotos.has(uid)) status = "accepted";
      }
      return {
        ...d,
        status,
        practitioner_name: nameMap[d.practitioner_id] || "Unknown",
      };
    }));
    setLoading(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from("client_invitations").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invitation deleted" });
      setInvitations(prev => prev.filter(i => i.id !== id));
    }
    setDeleting(null);
  }

  const statuses = [...new Set(invitations.map(i => i.status))];

  const filtered = invitations.filter(inv => {
    const q = search.toLowerCase();
    const matchesSearch = !q || inv.name.toLowerCase().includes(q) || inv.email.toLowerCase().includes(q) || inv.practitioner_name.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="text-center py-8 text-sm text-muted-foreground">Loading invitations…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Client Invitations
          <span className="text-muted-foreground font-normal">({invitations.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map(s => (
                <SelectItem key={s} value={s}>{INVITATION_STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {search ? "No invitations match your search." : "No invitations found."}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map(inv => (
              <div key={inv.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.email} {inv.phone ? `• ${inv.phone}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    By: {inv.practitioner_name} · Sent {new Date(inv.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} at {new Date(inv.created_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] flex-shrink-0 ${getInvitationStatusClass(inv.status)}`}
                >
                  {getInvitationStatusLabel(inv.status)}
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting === inv.id}
                    >
                      {deleting === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to delete this invitation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the invitation for <strong>{inv.name}</strong> ({inv.email}). This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(inv.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
