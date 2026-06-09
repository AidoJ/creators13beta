/**
 * Community Dashboard — Batch 7 (Appendix 7 of Phase 2 spec).
 *
 * Mounted at /community/dashboard. Separate surface from /dashboard (which
 * remains the paid-enrollment landing). Renders the "face view" of members
 * as concentric Lotus rings sized by match score, with the Creator of the
 * Month featured at the top.
 *
 * Avatars are batch-signed client-side via storage.createSignedUrls — one
 * round trip instead of N+1.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import LotusProfile, { LotusCreatorType } from "@/components/community/LotusProfile";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Map as MapIcon, Users, MessageCircle, Calendar, ShoppingBag, Copy, Check, LayoutDashboard } from "lucide-react";
import { capitaliseTypeName, getCreatorTypeColor } from "@/lib/creatorTypes";
import { glyphMarkForType } from "@/lib/game/glyphs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { backgroundForSeason } from "@/lib/seasonalBackgrounds";

type MatchRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_label: string | null;
  tier: string | null;
  score: number;
  community_joined_at: string | null;
  creator_types: LotusCreatorType[] | null;
};

type CreatorOfMonth = {
  creator_type: string;
  cycle_position: number;
  cycle_started_at: string;
  cycle_ends_at: string;
  computed_at: string;
};

// Tier order for size buckets. Compressed 2.5:1 range so smaller matches still
// register as members rather than visual placeholders.
function sizeFor(score: number): "sm" | "md" | "lg" | "xl" {
  if (score >= 7) return "xl";
  if (score >= 5) return "lg";
  if (score >= 3) return "md";
  return "sm";
}

function formatCycleDate(iso: string, includeYear: boolean) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

export default function CommunityDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [signedAvatars, setSignedAvatars] = useState<Record<string, string>>({});
  const [featured, setFeatured] = useState<CreatorOfMonth | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [myTypes, setMyTypes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [matchesRes, featuredRes, codeRes, mineRes] = await Promise.all([
        supabase.rpc("get_my_top_matches", { _limit: 50 }),
        supabase.rpc("get_creator_of_the_month"),
        supabase.from("profiles").select("invitation_code").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("creator_type_profiles")
          .select("primary_type, secondary_type, type_3, type_4")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const rows = ((matchesRes.data as MatchRow[] | null) ?? []).filter((r) => r.score > 0);
      setMatches(rows);

      // Batch-sign avatars in a single storage round-trip. Skip absolute URLs.
      const keys = rows
        .map((r) => r.avatar_url)
        .filter((v): v is string => !!v && !/^https?:\/\//i.test(v));
      if (keys.length > 0) {
        const { data: signed } = await supabase.storage
          .from("profile-avatars")
          .createSignedUrls(keys, 60 * 60);
        if (signed && !cancelled) {
          const map: Record<string, string> = {};
          for (const s of signed) {
            if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
          }
          setSignedAvatars(map);
        }
      }

      if (featuredRes.data) setFeatured(featuredRes.data as CreatorOfMonth);
      if (codeRes.data?.invitation_code) setMyCode(codeRes.data.invitation_code);
      if (mineRes.data) {
        const t = [
          mineRes.data.primary_type,
          mineRes.data.secondary_type,
          mineRes.data.type_3,
          mineRes.data.type_4,
        ].filter(Boolean) as string[];
        setMyTypes(t.map((x) => x.toLowerCase()));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const featuredKey = featured?.creator_type?.toLowerCase() ?? null;
  const featuredColor = featuredKey ? getCreatorTypeColor(featuredKey) : undefined;
  const viewerShares = !!(featuredKey && myTypes.includes(featuredKey));

  // Group rings by size for organic concentric layout.
  const rings = useMemo(() => {
    const xl: MatchRow[] = [];
    const lg: MatchRow[] = [];
    const md: MatchRow[] = [];
    const sm: MatchRow[] = [];
    for (const m of matches) {
      const s = sizeFor(m.score);
      if (s === "xl") xl.push(m);
      else if (s === "lg") lg.push(m);
      else if (s === "md") md.push(m);
      else sm.push(m);
    }
    return { xl, lg, md, sm };
  }, [matches]);

  const resolveAvatar = (key: string | null) => {
    if (!key) return null;
    if (/^https?:\/\//i.test(key)) return key;
    return signedAvatars[key] ?? null;
  };

  const isFeaturedMember = (types: LotusCreatorType[] | null) => {
    if (!featuredKey || !types) return false;
    return types.some((t) => t.type?.toLowerCase() === featuredKey);
  };

  const copyInvite = async () => {
    if (!myCode) return;
    const link = `${window.location.origin}/enroll?ref=${myCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Invite link copied", description: link });
    setTimeout(() => setCopied(false), 2000);
  };

  // Cycle date format: only show year if cycle crosses a year boundary.
  const cycleLabel = featured
    ? (() => {
        const start = new Date(featured.cycle_started_at + "T00:00:00");
        const end = new Date(featured.cycle_ends_at + "T00:00:00");
        const crosses = start.getFullYear() !== end.getFullYear();
        return `${formatCycleDate(featured.cycle_started_at, crosses)} – ${formatCycleDate(
          featured.cycle_ends_at,
          crosses
        )}`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 relative">
      {/* Seasonal backdrop — 10% opacity (90% transparent), swaps with the
          current Creator-of-the-Month season. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center transition-[background-image] duration-700"
        style={{ backgroundImage: `url(${backgroundForSeason(featured?.creator_type)})`, opacity: 0.1 }}
      />
      <div className="relative z-10">
      <DashboardHeader email={user?.email} onSignOut={signOut} />

      {/* Left vertical rail: Events, Chat, Match (Dashboard), Shop */}
      <TooltipProvider delayDuration={150}>
        <nav
          aria-label="Community quick nav"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 rounded-full border border-border bg-card/80 backdrop-blur px-2 py-3 shadow-sm"
        >
          {[
            { label: "Events", Icon: Calendar, soon: true, onClick: () => {} },
            { label: "Chat", Icon: MessageCircle, soon: true, onClick: () => {} },
            {
              label: "Match (Dashboard)",
              Icon: LayoutDashboard,
              soon: false,
              onClick: () => navigate("/dashboard"),
            },
            { label: "Shop", Icon: ShoppingBag, soon: true, onClick: () => {} },
          ].map(({ label, Icon, soon, onClick }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClick}
                  disabled={soon}
                  aria-label={label}
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                    soon
                      ? "text-muted-foreground/70 opacity-70 cursor-not-allowed"
                      : "text-foreground hover:bg-primary/10"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{soon ? `${label} — coming soon` : label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>

      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-6 pl-20">
        {/* Top toolbar: view toggle + settings */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TooltipProvider delayDuration={150}>
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
              <button
                type="button"
                className="px-4 py-1.5 text-sm rounded-full bg-primary text-primary-foreground font-medium inline-flex items-center gap-2"
                aria-pressed="true"
              >
                <Users className="h-4 w-4" />
                Faces
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="px-4 py-1.5 text-sm rounded-full text-muted-foreground inline-flex items-center gap-2 opacity-60 cursor-not-allowed"
                  >
                    <MapIcon className="h-4 w-4" />
                    Map
                  </button>
                </TooltipTrigger>
                <TooltipContent>Map view — coming soon</TooltipContent>
              </Tooltip>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings/community")}
              aria-label="Community settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </TooltipProvider>
        </div>


        {/* Creator of the Month badge */}
        {featured && (
          <div
            className="rounded-3xl border bg-card/70 backdrop-blur p-5 flex items-center gap-4 shadow-sm"
            style={{
              borderColor: featuredColor ? `${featuredColor}66` : undefined,
              background: featuredColor
                ? `linear-gradient(135deg, ${featuredColor}14, transparent 70%)`
                : undefined,
            }}
          >
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center shadow-md flex-shrink-0 p-2"
              style={{ backgroundColor: featuredColor }}
              aria-hidden
            >
              {(() => {
                const g = glyphMarkForType(capitaliseTypeName(featured.creator_type));
                return g ? (
                  <img
                    src={g}
                    alt=""
                    className="w-full h-full object-contain"
                    style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))" }}
                    draggable={false}
                  />
                ) : (
                  <span className="font-display text-2xl text-white">
                    {capitaliseTypeName(featured.creator_type).charAt(0)}
                  </span>
                );
              })()}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Creator of the Month · Season {featured.cycle_position} of 13
              </p>
              <p className="text-xl font-display">
                {capitaliseTypeName(featured.creator_type)}
              </p>
              {cycleLabel && (
                <p className="text-xs text-muted-foreground">{cycleLabel}</p>
              )}
              {viewerShares && (
                <p className="text-xs mt-1" style={{ color: featuredColor }}>
                  You're a {capitaliseTypeName(featured.creator_type)} Creator this month.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lotus field */}
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-full" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState code={myCode} onCopy={copyInvite} copied={copied} />
        ) : (
          <div className="relative py-8 space-y-10">
            <Ring members={rings.xl} size="xl" gap="gap-10" navigate={navigate}
              resolveAvatar={resolveAvatar} isFeatured={isFeaturedMember} featuredColor={featuredColor} />
            <Ring members={rings.lg} size="lg" gap="gap-8" navigate={navigate}
              resolveAvatar={resolveAvatar} isFeatured={isFeaturedMember} featuredColor={featuredColor} />
            <Ring members={rings.md} size="md" gap="gap-6" navigate={navigate}
              resolveAvatar={resolveAvatar} isFeatured={isFeaturedMember} featuredColor={featuredColor} />
            <Ring members={rings.sm} size="sm" gap="gap-4" navigate={navigate}
              resolveAvatar={resolveAvatar} isFeatured={isFeaturedMember} featuredColor={featuredColor} />
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

function Ring({
  members,
  size,
  gap,
  navigate,
  resolveAvatar,
  isFeatured,
  featuredColor,
}: {
  members: MatchRow[];
  size: "sm" | "md" | "lg" | "xl";
  gap: string;
  navigate: (path: string) => void;
  resolveAvatar: (key: string | null) => string | null;
  isFeatured: (types: LotusCreatorType[] | null) => boolean;
  featuredColor?: string;
}) {
  if (members.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center", gap)}>
      {members.map((m) => {
        const highlight = isFeatured(m.creator_types);
        return (
          <div
            key={m.user_id}
            className="relative rounded-full"
            style={
              highlight && featuredColor
                ? { boxShadow: `0 0 0 3px ${featuredColor}, 0 0 24px ${featuredColor}80` }
                : undefined
            }
          >
            <LotusProfile
              avatarUrl={resolveAvatar(m.avatar_url)}
              displayName={m.display_name ?? "Member"}
              creatorTypes={m.creator_types ?? []}
              size={size}
              matchScore={m.score}
              onClick={() => navigate(`/member/${m.user_id}`)}
            />
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  code,
  onCopy,
  copied,
}: {
  code: string | null;
  onCopy: () => void;
  copied: boolean;
}) {
  const link = code ? `${window.location.origin}/enroll?ref=${code}` : null;
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center space-y-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-display">No matches yet</h2>
      <p className="text-muted-foreground text-sm">
        As more Creators join and complete their profiles, you'll see who you're most aligned
        with here. Invite someone you'd love to share this with.
      </p>
      {link ? (
        <div className="flex items-center gap-2 max-w-md mx-auto rounded-full border border-border bg-background px-4 py-2">
          <code className="text-xs truncate flex-1 text-left">{link}</code>
          <Button size="sm" variant="ghost" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Invite code unavailable.</p>
      )}
    </div>
  );
}
