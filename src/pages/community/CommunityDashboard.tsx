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
import { useEffect, useMemo, useRef, useState } from "react";
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
import { glyphForType } from "@/lib/game/glyphs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { backgroundForSeason } from "@/lib/seasonalBackgrounds";

type MatchRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_label: string | null;
  location_lat: number | null;
  location_lng: number | null;
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
  if (score >= 8) return "xl";
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

      const rows = ((matchesRes.data as unknown as MatchRow[] | null) ?? []).filter((r) => r.score > 0);
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

      {/* Top-left stack: Creator of the Month hex + quick-nav rail aligned beneath it */}
      <div className="fixed top-20 left-3 z-20 flex flex-col items-center gap-4">
        {featured && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="w-20 h-20 flex items-center justify-center cursor-help"
                  aria-label={`Creator of the Month: ${capitaliseTypeName(featured.creator_type)}`}
                >
                  {(() => {
                    const g = glyphForType(capitaliseTypeName(featured.creator_type));
                    return g ? (
                      <img
                        src={g}
                        alt=""
                        className="w-full h-full object-contain"
                        style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.25))" }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: featuredColor }}
                      >
                        <span className="font-display text-xl text-white">
                          {capitaliseTypeName(featured.creator_type).charAt(0)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">
                  Creator of the Month · {capitaliseTypeName(featured.creator_type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Season {featured.cycle_position} of 13
                  {cycleLabel ? ` · ${cycleLabel}` : ""}
                </p>
                {viewerShares && (
                  <p className="text-xs mt-1" style={{ color: featuredColor }}>
                    You're a {capitaliseTypeName(featured.creator_type)} Creator this month.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider delayDuration={150}>
          <nav aria-label="Community quick nav" className="flex flex-col items-center gap-3">
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
            ].map(({ label, Icon, soon, onClick }) => {
              const color = featuredColor ?? "hsl(var(--primary))";
              return (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onClick}
                      disabled={soon}
                      aria-label={label}
                      className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center bg-transparent transition-transform",
                        soon ? "opacity-70 cursor-not-allowed" : "hover:scale-110 active:scale-95"
                      )}
                      style={{ border: `2px solid ${color}`, color }}
                    >
                      <Icon className="h-5 w-5" style={{ color }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{soon ? `${label} — coming soon` : label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>
      </div>


      {/* Top-right: Face/Map toggle + Settings */}
      <TooltipProvider delayDuration={150}>
        <div className="fixed top-20 right-4 z-20 flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="switch"
                aria-checked="false"
                aria-label="Toggle Face / Map view (Map coming soon)"
                disabled
                className="relative inline-flex h-7 w-14 items-center rounded-full bg-primary/80 opacity-90 cursor-not-allowed"
              >
                <span className="absolute left-1 inline-flex items-center justify-center h-5 w-5 rounded-full bg-white shadow">
                  <Users className="h-3 w-3 text-primary" />
                </span>
                <MapIcon className="absolute right-1.5 h-3.5 w-3.5 text-white/80" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Face view · Map coming soon</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/settings/community")}
            aria-label="Community settings"
            className="rounded-full bg-card/80 backdrop-blur"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </TooltipProvider>

      <main className="container mx-auto px-4 py-6 max-w-6xl space-y-6 pl-20">


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
          <Honeycomb
            members={matches}
            navigate={navigate}
            resolveAvatar={resolveAvatar}
            isFeatured={isFeaturedMember}
            featuredColor={featuredColor}
          />
        )}
      </main>
      </div>
    </div>
  );
}

/**
 * Organic honeycomb layout — tiles dynamically resize to fill the available
 * viewport. Few matches → larger tiles; many matches → smaller tiles. The
 * top-scoring match always renders biggest so face size still encodes match
 * strength, with the rest scaled proportionally to their score.
 */
function Honeycomb({
  members,
  navigate,
  resolveAvatar,
  isFeatured,
  featuredColor,
}: {
  members: MatchRow[];
  navigate: (path: string) => void;
  resolveAvatar: (key: string | null) => string | null;
  isFeatured: (types: LotusCreatorType[] | null) => boolean;
  featuredColor?: string;
}) {
  const sorted = useMemo(
    () => [...members].sort((a, b) => b.score - a.score),
    [members]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Reserve vertical space below the container for visual breathing room.
      const vh = window.innerHeight;
      const top = rect.top;
      const h = Math.max(360, vh - top - 24);
      setDims({ w: rect.width, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sorted.length]);

  // Compute base tile size from available area / count. Sqrt packing heuristic
  // — each tile occupies ~ (base * 1.15)² of area on average. Clamped to keep
  // single-match views from going absurdly huge and large lists from going
  // unreadably tiny.
  const sizes = useMemo(() => {
    const count = sorted.length;
    if (count === 0 || dims.w === 0) return [] as number[];
    const area = dims.w * dims.h;
    const ideal = Math.sqrt(area / count) * 0.78;
    const base = Math.max(110, Math.min(340, ideal));

    // Absolute-score scale (not rank-relative) so two low scorers (e.g. 1
    // vs 2) still render visibly different. Sqrt curve expands the low end
    // where most matches live; assumes a nominal max score of 10.
    const NOMINAL_MAX = 10;
    return sorted.map((m) => {
      const norm = Math.min(1, Math.max(0, (m.score || 0) / NOMINAL_MAX));
      const factor = 0.5 + Math.sqrt(norm) * 0.9; // ~0.5 .. 1.4
      return Math.round(base * factor);
    });
  }, [sorted, dims]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      style={{ minHeight: dims.h || undefined }}
    >
      {sorted.map((m, i) => {
        const highlight = isFeatured(m.creator_types);
        const px = sizes[i] ?? 180;
        // Honeycomb stagger: every other tile drops by ~25% of its size to
        // mimic offset hex rows on the game board.
        const yOffset = i % 2 === 0 ? 0 : Math.round(px * 0.22);
        return (
          <div
            key={m.user_id}
            style={{ transform: `translateY(${yOffset}px)` }}
            title={`${m.display_name ?? "Member"} — Match strength: ${m.score}`}
          >
            <LotusProfile
              avatarUrl={resolveAvatar(m.avatar_url)}
              displayName={m.display_name ?? "Member"}
              creatorTypes={m.creator_types ?? []}
              sizePx={px}
              featuredHighlight={highlight ? "glow" : null}
              featuredColor={featuredColor}
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
