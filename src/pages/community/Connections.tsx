/**
 * /community/connections — Connection Hub (Batch C).
 * Three tabs: Pending (incoming), Approved (with revealed channels), Sent (outgoing).
 * No in-app messaging — handles only.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Leaf, User as UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CHANNEL_LABEL, formatAuDate, formatAuDateTime, relativeFromNow, RequestStatus } from "@/lib/contacts";

type Incoming = {
  id: string;
  from_user_id: string;
  from_display_name: string | null;
  from_avatar_url: string | null;
  reason: string;
  status: RequestStatus;
  created_at: string;
};

type Outgoing = {
  id: string;
  to_user_id: string;
  to_display_name: string | null;
  to_avatar_url: string | null;
  reason: string;
  status: RequestStatus;
  decline_comment: string | null;
  created_at: string;
  responded_at: string | null;
  revoked_at: string | null;
};

type ApprovedChannelValue =
  | string
  | { number?: string | null; call_ok?: boolean; sms_ok?: boolean }
  | null;
type Approved = {
  other_user_id: string;
  other_display_name: string | null;
  other_avatar_url: string | null;
  approved_at: string | null;
  channels: Record<string, ApprovedChannelValue> | null;
};

function formatChannelValue(key: string, val: ApprovedChannelValue): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (key === "phone" && typeof val === "object") {
    const num = (val.number ?? "").toString();
    const tags = [val.call_ok ? "call OK" : null, val.sms_ok ? "SMS OK" : null].filter(Boolean);
    return tags.length ? `${num} (${tags.join(", ")})` : num;
  }
  return String((val as any).number ?? "");
}

const TAB_KEYS = ["pending", "approved", "sent"] as const;
type TabKey = (typeof TAB_KEYS)[number];

async function signAvatars(keys: (string | null)[]): Promise<Record<string, string>> {
  const filtered = Array.from(new Set(keys.filter((k): k is string => !!k && !/^https?:\/\//i.test(k))));
  if (filtered.length === 0) return {};
  const { data } = await supabase.storage.from("profile-avatars").createSignedUrls(filtered, 60 * 60);
  const out: Record<string, string> = {};
  for (const s of data ?? []) if (s.path && s.signedUrl) out[s.path] = s.signedUrl;
  return out;
}

function resolveAvatar(key: string | null, signed: Record<string, string>): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return signed[key] ?? null;
}

function StatusPill({ status }: { status: RequestStatus }) {
  const map: Record<RequestStatus, { label: string; className: string }> = {
    pending:   { label: "Pending",   className: "bg-primary/15 text-primary border-primary/30" },
    approved:  { label: "Approved",  className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
    declined:  { label: "Declined",  className: "bg-destructive/10 text-destructive border-destructive/30" },
    withdrawn: { label: "Withdrawn", className: "bg-muted text-muted-foreground border-border" },
    revoked:   { label: "Revoked",   className: "bg-muted/60 text-muted-foreground border-border" },
  };
  const m = map[status];
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  return (
    <div className="h-12 w-12 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon className="h-6 w-6 text-muted-foreground/70" />
      )}
    </div>
  );
}

export default function Connections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as TabKey) ?? "pending";
  const [tab, setTab] = useState<TabKey>(TAB_KEYS.includes(initialTab) ? initialTab : "pending");

  const [loading, setLoading] = useState(true);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});

  // Modals
  const [declineFor, setDeclineFor] = useState<Incoming | null>(null);
  const [declineComment, setDeclineComment] = useState("");
  const [revokeFor, setRevokeFor] = useState<Approved | null>(null);
  const [withdrawFor, setWithdrawFor] = useState<Outgoing | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/community/connections", { replace: true });
  }, [user, authLoading, navigate]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [inRes, outRes, apRes] = await Promise.all([
      (supabase as any).rpc("get_incoming_contact_requests"),
      (supabase as any).rpc("get_outgoing_contact_requests"),
      (supabase as any).rpc("get_my_approved_contacts"),
    ]);
    const ins = (inRes.data ?? []) as Incoming[];
    const outs = (outRes.data ?? []) as Outgoing[];
    const aps = (apRes.data ?? []) as Approved[];
    setIncoming(ins);
    setOutgoing(outs);
    setApproved(aps);
    const allKeys = [
      ...ins.map((r) => r.from_avatar_url),
      ...outs.map((r) => r.to_avatar_url),
      ...aps.map((r) => r.other_avatar_url),
    ];
    setSigned(await signAvatars(allKeys));
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onTabChange = (next: string) => {
    const t = (TAB_KEYS as readonly string[]).includes(next) ? (next as TabKey) : "pending";
    setTab(t);
    const p = new URLSearchParams(params);
    p.set("tab", t);
    setParams(p, { replace: true });
  };

  const handleApprove = async (id: string) => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("approve_contact_request", { _request_id: id });
    setBusy(false);
    if (error) { toast({ title: "Couldn't approve", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Connection approved" });
    void refresh();
  };

  const submitDecline = async () => {
    if (!declineFor) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("decline_contact_request", {
      _request_id: declineFor.id,
      _comment: declineComment.trim() || null,
    });
    setBusy(false);
    if (error) { toast({ title: "Couldn't decline", description: error.message, variant: "destructive" }); return; }
    setDeclineFor(null);
    setDeclineComment("");
    toast({ title: "Request declined" });
    void refresh();
  };

  const submitWithdraw = async () => {
    if (!withdrawFor) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("withdraw_contact_request", { _request_id: withdrawFor.id });
    setBusy(false);
    if (error) { toast({ title: "Couldn't withdraw", description: error.message, variant: "destructive" }); return; }
    setWithdrawFor(null);
    toast({ title: "Request withdrawn" });
    void refresh();
  };

  const submitRevoke = async () => {
    if (!revokeFor) return;
    // Find the approved row's request id. Approved rows don't include id;
    // we need to look it up via outgoing or — simpler — re-query.
    setBusy(true);
    const { data: rows, error: fetchErr } = await supabase
      .from("contact_requests")
      .select("id")
      .eq("status", "approved")
      .or(`and(from_user_id.eq.${user!.id},to_user_id.eq.${revokeFor.other_user_id}),and(from_user_id.eq.${revokeFor.other_user_id},to_user_id.eq.${user!.id})`)
      .limit(1);
    if (fetchErr || !rows || rows.length === 0) {
      setBusy(false);
      toast({ title: "Couldn't revoke", description: fetchErr?.message ?? "Connection not found", variant: "destructive" });
      return;
    }
    const { error } = await (supabase as any).rpc("revoke_contact_request", { _request_id: rows[0].id });
    setBusy(false);
    if (error) { toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" }); return; }
    setRevokeFor(null);
    toast({ title: "Connection revoked" });
    void refresh();
  };

  const copyHandle = async (key: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  if (authLoading || (loading && incoming.length === 0 && outgoing.length === 0 && approved.length === 0)) {
    return <div className="min-h-screen flex items-center justify-center"><Leaf className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Connections</h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/community/dashboard"><ArrowLeft className="h-4 w-4 mr-1.5" />Community</Link>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList>
            <TabsTrigger value="pending">Pending ({incoming.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
            <TabsTrigger value="sent">Sent ({outgoing.length})</TabsTrigger>
          </TabsList>

          {/* ============ PENDING ============ */}
          <TabsContent value="pending" className="space-y-3 mt-4">
            {incoming.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">No new connection requests right now.</p>
            ) : incoming.map((r) => (
              <article key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Link to={`/member/${r.from_user_id}`}><Avatar url={resolveAvatar(r.from_avatar_url, signed)} name={r.from_display_name} /></Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/member/${r.from_user_id}`} className="font-semibold hover:underline">{r.from_display_name ?? "Member"}</Link>
                    <p className="text-xs text-muted-foreground">Received {relativeFromNow(r.created_at)}</p>
                    <p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">"{r.reason}"</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button asChild variant="ghost" size="sm"><Link to={`/member/${r.from_user_id}`}>View profile</Link></Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => { setDeclineFor(r); setDeclineComment(""); }}>Decline</Button>
                  <Button size="sm" disabled={busy} onClick={() => handleApprove(r.id)}>Approve</Button>
                </div>
              </article>
            ))}
          </TabsContent>

          {/* ============ APPROVED ============ */}
          <TabsContent value="approved" className="space-y-3 mt-4">
            {approved.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-muted-foreground">You haven't connected with any other Creators yet.</p>
                <Button asChild variant="outline"><Link to="/community/dashboard">Browse the community</Link></Button>
              </div>
            ) : approved.map((r) => {
              const channels = r.channels ?? {};
              const keys = Object.keys(channels).filter((k) => channels[k]);
              return (
                <article key={r.other_user_id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Link to={`/member/${r.other_user_id}`}><Avatar url={resolveAvatar(r.other_avatar_url, signed)} name={r.other_display_name} /></Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/member/${r.other_user_id}`} className="font-semibold hover:underline">{r.other_display_name ?? "Member"}</Link>
                      <p className="text-xs text-muted-foreground">Connected {formatAuDate(r.approved_at)}</p>
                    </div>
                  </div>
                  {keys.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      {r.other_display_name ?? "This Creator"} has disabled the channels you both had in common. They may have updated their preferences.
                    </p>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Channels you can use to reach {r.other_display_name ?? "them"}:
                      </p>
                      <ul className="space-y-1">
                        {keys.map((k) => {
                          const val = formatChannelValue(k, channels[k]);
                          if (!val) return null;
                          const ckey = `${r.other_user_id}:${k}`;
                          return (
                            <li key={k} className="flex items-center justify-between gap-2 text-sm rounded-md bg-muted/40 px-3 py-2">
                              <span className="truncate"><span className="font-medium">{CHANNEL_LABEL[k] ?? k}</span> — {val}</span>
                              <Button size="sm" variant="ghost" className="h-7 px-2 flex-shrink-0" onClick={() => copyHandle(ckey, val)}>
                                {copiedKey === ckey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                <span className="ml-1 text-xs">{copiedKey === ckey ? "Copied" : "Copy"}</span>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 justify-end pt-1">
                    <Button asChild variant="ghost" size="sm"><Link to={`/member/${r.other_user_id}`}>View profile</Link></Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setRevokeFor(r)}>Revoke connection</Button>
                  </div>
                </article>
              );
            })}
          </TabsContent>

          {/* ============ SENT ============ */}
          <TabsContent value="sent" className="space-y-3 mt-4">
            {outgoing.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-muted-foreground">You haven't sent any connection requests yet.</p>
                <Button asChild variant="outline"><Link to="/community/dashboard">Browse the community</Link></Button>
              </div>
            ) : outgoing.map((r) => (
              <article key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Link to={`/member/${r.to_user_id}`}><Avatar url={resolveAvatar(r.to_avatar_url, signed)} name={r.to_display_name} /></Link>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/member/${r.to_user_id}`} className="font-semibold hover:underline">{r.to_display_name ?? "Member"}</Link>
                      <StatusPill status={r.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">Sent {formatAuDateTime(r.created_at)}</p>
                    {r.status === "pending" && (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-1">"{r.reason}"</p>
                    )}
                    {r.status === "declined" && r.decline_comment && (
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium text-foreground/80">Comment:</span> "{r.decline_comment}"
                      </p>
                    )}
                    {r.status === "approved" && r.responded_at && (
                      <p className="text-xs text-muted-foreground">Approved {formatAuDate(r.responded_at)}</p>
                    )}
                    {r.status === "revoked" && r.revoked_at && (
                      <p className="text-xs text-muted-foreground">Revoked {formatAuDate(r.revoked_at)}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button asChild variant="ghost" size="sm"><Link to={`/member/${r.to_user_id}`}>View profile</Link></Button>
                  {r.status === "pending" && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setWithdrawFor(r)}>Withdraw</Button>
                  )}
                  {r.status === "approved" && (
                    <Button variant="outline" size="sm" onClick={() => onTabChange("approved")}>View in Approved tab</Button>
                  )}
                </div>
              </article>
            ))}
          </TabsContent>
        </Tabs>
      </main>

      {/* Decline modal */}
      <Dialog open={!!declineFor} onOpenChange={(o) => !o && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline {declineFor?.from_display_name ?? "this"} request?</DialogTitle>
            <DialogDescription>You can include a brief comment (optional). They'll see it in their Sent tab.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={declineComment}
            onChange={(e) => setDeclineComment(e.target.value)}
            placeholder="Optional comment…"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">{declineComment.length}/500</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineFor(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={submitDecline} disabled={busy}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw modal */}
      <AlertDialog open={!!withdrawFor} onOpenChange={(o) => !o && setWithdrawFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw your request to {withdrawFor?.to_display_name ?? "this Creator"}?</AlertDialogTitle>
            <AlertDialogDescription>They'll no longer see it. You can send a new request later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitWithdraw} disabled={busy}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke modal */}
      <AlertDialog open={!!revokeFor} onOpenChange={(o) => !o && setRevokeFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke your connection with {revokeFor?.other_display_name ?? "this Creator"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer see your contact details, and you won't see theirs. This can't be undone, but you can send a new request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitRevoke} disabled={busy}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
