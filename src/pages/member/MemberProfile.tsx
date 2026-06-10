/**
 * Public member profile view (/member/:userId).
 *
 * Read-only profile content backed by get_public_member_profile (SECURITY
 * DEFINER). Adds Batch C contact section: target's open_to_contact and
 * enabled_channels are surfaced; full handles are NEVER returned by the
 * public RPC — handles only appear in /community/connections after approval.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Leaf, MapPin, Pencil, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { sortCreatorTypes } from "@/lib/creatorTypes";
import LotusProfile, { LotusCreatorType } from "@/components/community/LotusProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TIERS, type TierKey } from "@/lib/tiers";
import { CHANNEL_LABEL } from "@/lib/contacts";

interface PublicProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_label: string | null;
  bio_superpower: string | null;
  bio_where_i_live: string | null;
  bio_intriguing: string | null;
  tier: TierKey | null;
  community_joined_at: string | null;
  creator_types: Array<{ type: string; source: LotusCreatorType["source"] }>;
  open_to_contact: boolean;
  enabled_channels: string[];
}

type RelationState =
  | { kind: "none" }
  | { kind: "pending_outgoing"; id: string }
  | { kind: "pending_incoming"; id: string }
  | { kind: "approved" }
  | { kind: "declined"; comment: string | null };

function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function NotFoundView() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="font-display text-3xl">This member isn't part of the community</h1>
        <p className="text-muted-foreground">
          Either they haven't joined the community yet, or their profile isn't
          visible. Ask them to share their member link with you directly.
        </p>
        <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    </div>
  );
}

export default function MemberProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null);
  const [relation, setRelation] = useState<RelationState>({ kind: "none" });
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const loadRelation = useCallback(async (targetId: string) => {
    if (!user) return;
    // Fetch the most recent contact_request between viewer and target in
    // either direction. RLS guarantees we only see rows where we're a party.
    const { data, error } = await supabase
      .from("contact_requests")
      .select("id, from_user_id, to_user_id, status, decline_comment, created_at")
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${targetId}),and(from_user_id.eq.${targetId},to_user_id.eq.${user.id})`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data) { setRelation({ kind: "none" }); return; }
    const approved = data.find((r) => r.status === "approved");
    if (approved) { setRelation({ kind: "approved" }); return; }
    const pending = data.find((r) => r.status === "pending");
    if (pending) {
      setRelation(
        pending.from_user_id === user.id
          ? { kind: "pending_outgoing", id: pending.id }
          : { kind: "pending_incoming", id: pending.id }
      );
      return;
    }
    // Most-recent outgoing decline (only show if no pending and no approved).
    const declinedOutgoing = data.find((r) => r.status === "declined" && r.from_user_id === user.id);
    if (declinedOutgoing) {
      setRelation({ kind: "declined", comment: declinedOutgoing.decline_comment ?? null });
      return;
    }
    setRelation({ kind: "none" });
  }, [user]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("get_public_member_profile", { _target_user_id: userId });
      if (cancelled) return;
      const rows = (data ?? []) as PublicProfile[];
      if (error || rows.length === 0) {
        setProfile(null); setResolvedAvatar(null); setLoading(false); return;
      }
      const row = rows[0];
      setProfile(row);
      const url = await resolveAvatarUrl(row.avatar_url);
      if (!cancelled) {
        setResolvedAvatar(url);
        await loadRelation(row.user_id);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, loadRelation]);

  const sortedTypes = useMemo<LotusCreatorType[]>(() => {
    if (!profile) return [];
    const names = profile.creator_types.map((t) => t.type);
    const sourceMap = new Map(profile.creator_types.map((t) => [t.type.toLowerCase(), t.source]));
    return sortCreatorTypes(names).map((name) => ({
      type: name,
      source: sourceMap.get(name.toLowerCase()) ?? "self_selected",
    }));
  }, [profile]);

  const submitRequest = async () => {
    if (!profile) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) return;
    setSending(true);
    const { error } = await (supabase as any).rpc("send_contact_request", {
      _to_user_id: profile.user_id,
      _reason: trimmed,
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send request", description: error.message, variant: "destructive" });
      return;
    }
    setModalOpen(false);
    setReason("");
    toast({ title: "Request sent" });
    await loadRelation(profile.user_id);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Leaf className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!profile) return <NotFoundView />;

  const memberSince = formatMemberSince(profile.community_joined_at);
  const tier = profile.tier ? TIERS[profile.tier] : null;
  const isOwn = user?.id === profile.user_id;

  const bios: Array<{ key: string; label: string; value: string | null }> = [
    { key: "superpower", label: "Superpower", value: profile.bio_superpower },
    { key: "where", label: "What I love about where I live", value: profile.bio_where_i_live },
    { key: "intriguing", label: "What's intriguing about me", value: profile.bio_intriguing },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <main className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/community/dashboard"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Community</Link>
        </Button>
        <header className="flex flex-col items-center text-center gap-4">
          <LotusProfile
            avatarUrl={resolvedAvatar}
            displayName={profile.display_name ?? "Member"}
            creatorTypes={sortedTypes}
            size="xl"
          />
          <div className="space-y-2">
            <h1 className="font-display text-4xl">{profile.display_name ?? "Member"}</h1>
            {profile.location_label && (
              <p className="text-muted-foreground flex items-center justify-center gap-1.5">
                <MapPin className="h-4 w-4" />{profile.location_label}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {tier && <Badge variant="secondary" className="font-display tracking-wide">{tier.name}</Badge>}
              {memberSince && <span className="text-xs text-muted-foreground">Member since {memberSince}</span>}
            </div>
          </div>

          {isOwn && (
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to="/settings/community"><Pencil className="h-4 w-4 mr-1.5" />Edit profile</Link>
            </Button>
          )}
        </header>

        {/* ---------------- Contact section (Batch C) ---------------- */}
        {!isOwn && (
          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-primary font-semibold">Connect</h2>
            {!profile.open_to_contact || profile.enabled_channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This Creator isn't currently accepting connection requests.
              </p>
            ) : relation.kind === "approved" ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Connected — view contact details in your{" "}
                  <Link to="/community/connections?tab=approved" className="text-primary hover:underline font-semibold">
                    Connections
                  </Link>.
                </p>
              </div>
            ) : relation.kind === "pending_outgoing" ? (
              <div className="space-y-2">
                <Button disabled variant="outline" className="w-full sm:w-auto">Request sent — awaiting response</Button>
                <p className="text-xs">
                  <Link to="/community/connections?tab=sent" className="text-primary hover:underline">Withdraw request →</Link>
                </p>
              </div>
            ) : relation.kind === "pending_incoming" ? (
              <div className="space-y-2">
                <p className="text-sm">
                  This Creator has sent you a connection request. Review it in your{" "}
                  <Link to="/community/connections?tab=pending" className="text-primary hover:underline font-semibold">Connections</Link>.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {relation.kind === "declined" && relation.comment && (
                  <p className="text-sm text-muted-foreground italic">
                    This Creator declined a previous request: "{relation.comment}"
                  </p>
                )}
                <Button onClick={() => { setReason(""); setModalOpen(true); }} className="w-full sm:w-auto">
                  <Send className="h-4 w-4 mr-1.5" />Request to connect
                </Button>
                <p className="text-xs text-muted-foreground">
                  If they approve, you'll share contact details on any channels you've both enabled.
                </p>
                {profile.enabled_channels.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Channels they've enabled:{" "}
                    {profile.enabled_channels.map((k) => CHANNEL_LABEL[k] ?? k).join(", ")}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-4 pt-2">
          {bios.filter((b) => b.value && b.value.trim().length > 0).map((b) => (
            <article key={b.key} className="rounded-2xl border border-border bg-card p-5 space-y-2">
              <h2 className="text-xs uppercase tracking-widest text-primary font-semibold">{b.label}</h2>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{b.value}</p>
            </article>
          ))}
        </section>
      </main>

      {/* Request modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect with {profile.display_name ?? "this Creator"}</DialogTitle>
            <DialogDescription>
              They will see your message before deciding whether to approve. They'll see your profile too.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell them why you'd like to connect…"
            rows={4}
            maxLength={500}
            autoFocus
          />
          <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={submitRequest} disabled={sending || reason.trim().length === 0}>
              {sending ? <Leaf className="h-4 w-4 animate-spin" /> : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
