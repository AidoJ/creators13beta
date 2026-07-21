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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import LotusProfile, { LotusCreatorType } from "@/components/community/LotusProfile";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Map as MapIcon, Users, MessageCircle, Calendar, ShoppingBag, Copy, Check, LayoutDashboard, Menu, X, EyeOff, SlidersHorizontal } from "lucide-react";
import { capitaliseTypeName, CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";
import { isStockAvatarRef, stockAvatarUrl } from "@/lib/avatar";
import { glyphForType } from "@/lib/game/glyphs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { backgroundForSeason } from "@/lib/seasonalBackgrounds";
import eventsIcon from "@/assets/icon-Events_icon.png.asset.json";
import memberMatchIcon from "@/assets/icon-Member_Matcxh_icon.png.asset.json";
import shopIcon from "@/assets/icon-Shop_icon.png.asset.json";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MapMember } from "@/components/community/CommunityMapView";

// Lazy: Maps JS API only loads when the user actually toggles to Map view.
const CommunityMapView = lazy(() => import("@/components/community/CommunityMapView"));

// Warm up the Maps JS script + the MapView chunk in the background as soon as
// the Community Dashboard mounts, so toggling to Map view is near-instant.
// (No-op if the script is already in the page.)
let __c13MapWarmedUp = false;
function warmUpMaps() {
  if (__c13MapWarmedUp || typeof window === "undefined") return;
  __c13MapWarmedUp = true;
  // Prefetch the lazy chunk.
  import("@/components/community/CommunityMapView").catch(() => {});
  // Preconnect + start downloading the Maps JS bundle.
  const key = (import.meta as any).env?.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return;
  if (document.getElementById("c13-google-maps-js")) return;
  const pre = document.createElement("link");
  pre.rel = "preconnect";
  pre.href = "https://maps.googleapis.com";
  pre.crossOrigin = "";
  document.head.appendChild(pre);
  const pre2 = document.createElement("link");
  pre2.rel = "preconnect";
  pre2.href = "https://maps.gstatic.com";
  pre2.crossOrigin = "";
  document.head.appendChild(pre2);
  const s = document.createElement("script");
  s.id = "c13-google-maps-js";
  s.async = true;
  s.defer = true;
  (window as any).__c13MapsInitCallback = (window as any).__c13MapsInitCallback || (() => {});
  s.src =
    `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
    `&loading=async&callback=__c13MapsInitCallback`;
  document.head.appendChild(s);
}

type ViewMode = "face" | "map";
const VIEW_STORAGE_KEY = "c13.community.viewMode";

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

type FeaturedMeta = { family: string | null; team_role: string | null };
type CreatorTypeMeta = FeaturedMeta & { name: string; element: string | null };
type FilterMode = "month" | "family" | "element" | "role" | "type" | "all";

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
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [signedAvatars, setSignedAvatars] = useState<Record<string, string>>({});
  const [featured, setFeatured] = useState<CreatorOfMonth | null>(null);
  const [featuredMeta, setFeaturedMeta] = useState<FeaturedMeta | null>(null);
  const [creatorTypeMeta, setCreatorTypeMeta] = useState<CreatorTypeMeta[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [filterValue, setFilterValue] = useState("");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [myTypes, setMyTypes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "face";
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) ?? "face";
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unplottable, setUnplottable] = useState(0);
  const [isCommunityVisible, setIsCommunityVisible] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [visibilityBannerDismissed, setVisibilityBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("c13.community.visBanner.dismissed") === "1";
  });

  // Batch C — poll pending connection-request count for the badge. 60s,
  // and only while the tab is visible to avoid background churn.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const { data } = await (supabase as any).rpc("get_pending_request_count");
      if (!cancelled) setPendingCount(typeof data === "number" ? data : 0);
    };
    void tick();
    const id = window.setInterval(tick, 60_000);
    const onVis = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [user]);

  // Kick off Maps script + chunk preload in the background on first mount.
  useEffect(() => {
    const t = setTimeout(warmUpMaps, 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [matchesRes, featuredRes, codeRes, mineRes, typeMetaRes] = await Promise.all([
        supabase.rpc("get_community_members", { _limit: 200 }),
        supabase.rpc("get_creator_of_the_month"),
        supabase.from("profiles").select("invitation_code, community_visible").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("creator_type_profiles")
          .select("primary_type, secondary_type, type_3, type_4")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("creator_types").select("name, family, team_role, element"),
      ]);

      if (cancelled) return;

      const rows = ((matchesRes.data as unknown as MatchRow[] | null) ?? []);
      setMatches(rows);

      // Batch-sign avatars in a single storage round-trip. Skip absolute URLs
      // and stock-avatar refs (resolved locally).
      const keys = rows
        .map((r) => r.avatar_url)
        .filter((v): v is string => !!v && !/^https?:\/\//i.test(v) && !isStockAvatarRef(v));
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

      if (featuredRes.data) {
        const f = featuredRes.data as CreatorOfMonth;
        setFeatured(f);
        const { data: metaRow } = await supabase
          .from("creator_types")
          .select("family, team_role")
          .ilike("name", f.creator_type)
          .maybeSingle();
        if (!cancelled) setFeaturedMeta((metaRow as FeaturedMeta) ?? null);
      }
      if (codeRes.data?.invitation_code) setMyCode(codeRes.data.invitation_code);
      setIsCommunityVisible(codeRes.data?.community_visible ?? false);
      setCreatorTypeMeta((typeMetaRes.data as CreatorTypeMeta[] | null) ?? []);
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

  const filterOptions = useMemo(() => {
    const unique = (values: Array<string | null>) =>
      [...new Set(values.filter((value): value is string => !!value))].sort();
    if (filterMode === "family") return unique(creatorTypeMeta.map((row) => row.family));
    if (filterMode === "element") return unique(creatorTypeMeta.map((row) => row.element));
    if (filterMode === "role") return unique(creatorTypeMeta.map((row) => row.team_role));
    if (filterMode === "type") return [...CREATOR_TYPE_NAMES];
    return [];
  }, [creatorTypeMeta, filterMode]);

  useEffect(() => {
    if (filterMode === "month" || filterMode === "all") {
      setFilterValue("");
      return;
    }
    setFilterValue((current) => filterOptions.includes(current) ? current : (filterOptions[0] ?? ""));
  }, [filterMode, filterOptions]);

  const filteredMatches = useMemo(() => {
    if (filterMode === "all") return matches;
    const wantedTypeNames = new Set<string>();
    if (filterMode === "month" && featuredKey) wantedTypeNames.add(featuredKey);
    if (filterMode === "type" && filterValue) wantedTypeNames.add(filterValue.toLowerCase());
    if (filterMode === "family" || filterMode === "element" || filterMode === "role") {
      for (const row of creatorTypeMeta) {
        const candidate = filterMode === "family" ? row.family : filterMode === "element" ? row.element : row.team_role;
        if (candidate === filterValue) wantedTypeNames.add(row.name.toLowerCase());
      }
    }
    if (wantedTypeNames.size === 0) return [];
    return matches.filter((member) =>
      member.creator_types?.some((creatorType) => wantedTypeNames.has(creatorType.type.toLowerCase()))
    );
  }, [matches, filterMode, filterValue, featuredKey, creatorTypeMeta]);

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

  const resolveAvatar = useCallback((key: string | null) => {
    if (!key) return null;
    if (isStockAvatarRef(key)) return stockAvatarUrl(key);
    if (/^https?:\/\//i.test(key)) return key;
    return signedAvatars[key] ?? null;
  }, [signedAvatars]);

  const isFeaturedMember = useCallback((types: LotusCreatorType[] | null) => {
    if (!featuredKey || !types) return false;
    return types.some((t) => t.type?.toLowerCase() === featuredKey);
  }, [featuredKey]);

  // Map-mode payload: pre-resolved avatar URLs + flattened featured / primary
  // type so the MapView component stays a presentation layer.
  const mapMembers: MapMember[] = useMemo(
    () =>
      filteredMatches.map((m) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        avatar_url: resolveAvatar(m.avatar_url),
        location_lat: m.location_lat,
        location_lng: m.location_lng,
        score: m.score,
        primary_type: m.creator_types?.[0]?.type?.toLowerCase() ?? null,
        featured: isFeaturedMember(m.creator_types),
      })),
    [filteredMatches, resolveAvatar, isFeaturedMember]
  );

  const handleSelectMember = useCallback(
    (userId: string) => navigate(`/member/${userId}`),
    [navigate]
  );

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
        style={{ backgroundImage: `url(${backgroundForSeason(featured?.creator_type)})`, opacity: 0.45 }}
      />
      <div className="relative z-10">
      <DashboardHeader email={user?.email} onSignOut={signOut} />

      {/* Visibility nudge — shown when the viewer's community_visible=false.
          Session-only dismissal: reappears next visit until they enable. */}
      {isCommunityVisible === false && !visibilityBannerDismissed && (
        <div className="container mx-auto px-4 pt-3">
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
            <EyeOff className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="flex-1 text-foreground">
              Your profile is private — other Creators can&apos;t see you in their matches.{" "}
              <button
                type="button"
                onClick={() => navigate("/settings/community")}
                className="font-semibold text-primary hover:underline"
              >
                Enable visibility →
              </button>
            </p>
            <button
              type="button"
              onClick={() => {
                setVisibilityBannerDismissed(true);
                try { sessionStorage.setItem("c13.community.visBanner.dismissed", "1"); } catch { /* ignore */ }
              }}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}


      {/* Desktop rail. Phone and tablet controls render in-flow below so they
          can never cover navigation, banners, headings, or member content. */}
      {(() => {
        const collapsed = isMobile && view === "map" && !mobileNavOpen;
        if (collapsed) {
          return (
            <div className="hidden lg:flex fixed top-20 left-3 z-30 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open community navigation"
                className="h-10 w-10 rounded-full bg-card/90 backdrop-blur border border-border flex items-center justify-center shadow"
              >
                <Menu className="h-5 w-5" />
              </button>
              {featured && (() => {
                const g = glyphForType(capitaliseTypeName(featured.creator_type));
                return g ? (
                  <img
                    src={g}
                    alt={`Creator of the Month: ${capitaliseTypeName(featured.creator_type)}`}
                    title={`Creator of the Month: ${capitaliseTypeName(featured.creator_type)}`}
                    className="h-10 w-10 object-contain drop-shadow"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: featuredColor }}
                    title={`Creator of the Month: ${capitaliseTypeName(featured.creator_type)}`}
                  >
                    <span className="font-display text-sm text-white">
                      {capitaliseTypeName(featured.creator_type).charAt(0)}
                    </span>
                  </div>
                );
              })()}
            </div>
          );
        }
        return (
          <div className="fixed top-20 left-3 z-30 hidden lg:flex flex-col items-center gap-4">
            {isMobile && view === "map" && (
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close community navigation"
                className="h-9 w-9 rounded-full bg-card/90 backdrop-blur border border-border flex items-center justify-center shadow self-end"
              >
                <X className="h-4 w-4" />
              </button>
            )}
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
                    {featuredMeta?.family && (
                      <p className="text-xs mt-1" style={{ color: "#c9a84c" }}>
                        <span className="font-semibold">Family:</span> {featuredMeta.family}
                      </p>
                    )}
                    {featuredMeta?.team_role && (
                      <p className="text-xs" style={{ color: "#c9a84c" }}>
                        <span className="font-semibold">Team Role:</span> {featuredMeta.team_role}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: "#c9a84c" }}>
                      <span className="font-semibold">Season:</span> {featured.cycle_position} of 13
                      {cycleLabel ? ` · ${cycleLabel}` : ""}
                    </p>
                    {viewerShares && (
                      <p className="text-xs mt-1" style={{ color: "#c9a84c" }}>
                        You're a {capitaliseTypeName(featured.creator_type)} Creator this month.
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider delayDuration={150}>
              <nav aria-label="Community quick nav" className="flex flex-col items-center gap-3">
                {/* Filters — gold circular button with funnel icon, opens compact popover */}
                <Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Filter community members"
                          className="relative h-14 w-14 rounded-full flex items-center justify-center bg-card/80 backdrop-blur transition-transform hover:scale-110 active:scale-95"
                          style={{ border: `2.5px solid #c9a84c`, color: "#c9a84c" }}
                        >
                          <SlidersHorizontal className="h-7 w-7" strokeWidth={2.25} style={{ color: "#c9a84c" }} />
                          {filterMode !== "month" && (
                            <span
                              aria-hidden
                              className="absolute -top-1 -right-1 h-3 w-3 rounded-full shadow"
                              style={{ backgroundColor: "#c9a84c" }}
                            />
                          )}
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">Filters</TooltipContent>
                  </Tooltip>
                  <PopoverContent side="right" align="start" className="w-64 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter by</p>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Filter by">
                      {([
                        ["month", "Month"],
                        ["family", "Family"],
                        ["element", "Element"],
                        ["role", "Role"],
                        ["type", "Type"],
                        ["all", "All"],
                      ] as Array<[FilterMode, string]>).map(([mode, label]) => (
                        <Button
                          key={mode}
                          type="button"
                          size="sm"
                          variant={filterMode === mode ? "default" : "outline"}
                          onClick={() => setFilterMode(mode)}
                          aria-pressed={filterMode === mode}
                          className="h-8 text-xs px-2"
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    {filterOptions.length > 0 && (
                      <div>
                        <label className="sr-only" htmlFor="community-filter-value">Choose filter value</label>
                        <select
                          id="community-filter-value"
                          value={filterValue}
                          onChange={(event) => setFilterValue(event.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                        >
                          {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {filteredMatches.length} of {matches.length} shown
                    </p>
                  </PopoverContent>
                </Popover>

                {[
                  { label: "Events", img: eventsIcon.url, soon: false, onClick: () => navigate("/community/events"), badge: 0 },
                  {
                    label: "Connections",
                    Icon: MessageCircle,
                    soon: false,
                    onClick: () => navigate("/community/connections"),
                    badge: pendingCount,
                  },
                  {
                    label: "Match (Dashboard)",
                    img: memberMatchIcon.url,
                    soon: false,
                    onClick: () => navigate("/dashboard"),
                    badge: 0,
                  },
                  { label: "Shop", img: shopIcon.url, soon: false, onClick: () => window.open("https://creatortypes.gumroad.com/l/Creatorblueprint", "_blank", "noopener,noreferrer"), badge: 0 },
                ].map(({ label, Icon, img, soon, onClick, badge }) => {
                  // Gold to match the enrollment "Case Study Volunteer / Paying Client" cards.
                  const color = "#c9a84c";
                  return (
                    <Tooltip key={label}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => { onClick(); if (isMobile && view === "map") setMobileNavOpen(false); }}
                          disabled={soon}
                          aria-label={label}
                          className={cn(
                            "relative h-14 w-14 rounded-full flex items-center justify-center bg-card/80 backdrop-blur transition-transform",
                            soon ? "opacity-70 cursor-not-allowed" : "hover:scale-110 active:scale-95"
                          )}
                          style={{ border: `2.5px solid ${color}`, color }}
                        >
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              aria-hidden
                              className="h-8 w-8 object-contain"
                              style={{
                                // Recolour the PNG to the gold accent so it sits cleanly on every family background.
                                filter:
                                  "brightness(0) saturate(100%) invert(72%) sepia(43%) saturate(459%) hue-rotate(8deg) brightness(91%) contrast(86%)",
                              }}
                            />
                          ) : Icon ? (
                            <Icon className="h-7 w-7" strokeWidth={2.25} style={{ color }} />
                          ) : null}
                          {badge > 0 && (
                            <span
                              aria-label={`${badge} pending`}
                              className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-destructive text-destructive-foreground shadow"
                            >
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{soon ? `${label} — coming soon` : label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
            </TooltipProvider>

          </div>
        );
      })()}

      <div className="lg:hidden container mx-auto px-4 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2" aria-label="Community tools">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filter community members"
                className="relative min-h-11 min-w-11 shrink-0 rounded-full flex items-center justify-center bg-card/80 border-2 border-gold"
              >
                <SlidersHorizontal className="h-5 w-5 text-gold" strokeWidth={2.25} />
                {filterMode !== "month" && <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-gold" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="bottom" className="w-[min(16rem,calc(100vw-2rem))] p-3 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Filter by</p>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Filter by">
                {(["month", "family", "element", "role", "type", "all"] as FilterMode[]).map((mode) => (
                  <Button key={mode} type="button" size="sm" variant={filterMode === mode ? "default" : "outline"} onClick={() => setFilterMode(mode)} className="min-h-11 capitalize">
                    {mode}
                  </Button>
                ))}
              </div>
              {filterOptions.length > 0 && (
                <select value={filterValue} onChange={(event) => setFilterValue(event.target.value)} aria-label="Choose filter value" className="min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">
                  {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              )}
            </PopoverContent>
          </Popover>
          {[
            { label: "Events", img: eventsIcon.url, onClick: () => navigate("/community/events") },
            { label: "Connections", Icon: MessageCircle, onClick: () => navigate("/community/connections") },
            { label: "Dashboard", img: memberMatchIcon.url, onClick: () => navigate("/dashboard") },
            { label: "Shop", img: shopIcon.url, onClick: () => window.open("https://creatortypes.gumroad.com/l/Creatorblueprint", "_blank", "noopener,noreferrer") },
          ].map(({ label, Icon, img, onClick }) => (
            <button key={label} type="button" onClick={onClick} aria-label={label} className="min-h-11 min-w-11 shrink-0 rounded-full border-2 border-gold bg-card/80 flex items-center justify-center">
              {img ? <img src={img} alt="" aria-hidden className="h-6 w-6 object-contain" style={{ filter: "brightness(0) saturate(100%) invert(72%) sepia(43%) saturate(459%) hue-rotate(8deg) brightness(91%) contrast(86%)" }} /> : Icon ? <Icon className="h-5 w-5 text-gold" /> : null}
            </button>
          ))}
        </div>
      </div>


      {/* Top-right: Face/Map toggle + Settings */}
      <TooltipProvider delayDuration={150}>
        <div className="container mx-auto px-4 pt-1 lg:pt-0 lg:px-0 lg:fixed lg:top-20 lg:right-4 lg:z-30 lg:w-auto flex items-center justify-end gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="switch"
                aria-checked={view === "map"}
                aria-label={view === "map" ? "Switch to Face view" : "Switch to Map view"}
                onClick={() => setView((v) => (v === "map" ? "face" : "map"))}
                className="relative inline-flex h-7 w-14 items-center rounded-full bg-primary/80 transition-colors"
              >
                <span
                  className={cn(
                    "absolute inline-flex items-center justify-center h-5 w-5 rounded-full bg-white shadow transition-transform",
                    view === "map" ? "translate-x-[34px]" : "translate-x-1"
                  )}
                >
                  {view === "map"
                    ? <MapIcon className="h-3 w-3 text-primary" />
                    : <Users className="h-3 w-3 text-primary" />}
                </span>
                <Users className={cn("absolute left-1.5 h-3.5 w-3.5", view === "map" ? "text-white/80" : "opacity-0")} />
                <MapIcon className={cn("absolute right-1.5 h-3.5 w-3.5", view === "map" ? "opacity-0" : "text-white/80")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{view === "map" ? "Map view · click for Face" : "Face view · click for Map"}</TooltipContent>
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

      <main
        className={cn(
          "container mx-auto py-4 sm:py-6 space-y-4",
          view === "map"
            ? "max-w-none px-2 sm:px-4 lg:pl-20"
            : "px-4 max-w-6xl lg:pl-20"
        )}
      >
        <h1 className="font-display font-normal text-2xl sm:text-3xl md:text-4xl text-gold text-center drop-shadow-sm">
          Who's your Creator Match?
        </h1>
        {!loading && (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Showing {filteredMatches.length} of {matches.length} members
            {filterMode === "month" && featured ? ` · ${capitaliseTypeName(featured.creator_type)} is Creator of the Month` : ""}
            {filterMode === "family" && filterValue ? ` · Family: ${filterValue}` : ""}
            {filterMode === "element" && filterValue ? ` · Element: ${filterValue}` : ""}
            {filterMode === "role" && filterValue ? ` · Role: ${filterValue}` : ""}
            {filterMode === "type" && filterValue ? ` · Type: ${filterValue}` : ""}
            {filterMode === "all" ? " · All Creator Types" : ""}
          </p>
        )}
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-full" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState code={myCode} onCopy={copyInvite} copied={copied} />
        ) : filteredMatches.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-muted-foreground">
              No discoverable Creators match this filter yet
              {filterMode === "month" && featured ? ` — no ${capitaliseTypeName(featured.creator_type)} members are visible in your community right now.` : "."}
            </p>
            <p className="text-xs text-muted-foreground">
              Matches only include members who have set their profile discoverable. Try a broader filter, or invite more Creators.
            </p>
            <Button type="button" variant="outline" onClick={() => setFilterMode("all")}>Show all Creator Types</Button>
          </div>
        ) : view === "map" ? (
          <div className="space-y-2">
            <div
              className="rounded-2xl overflow-hidden border border-border"
              style={{ height: "calc(100vh - 9rem)" }}
            >
              <Suspense fallback={<div className="w-full h-full grid place-items-center text-sm text-muted-foreground">Loading map…</div>}>
                <CommunityMapView
                  members={mapMembers}
                  featuredColor={featuredColor}
                  onSelect={handleSelectMember}
                  onUnplottableCount={setUnplottable}
                />
              </Suspense>
            </div>
            {unplottable > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {unplottable} member{unplottable === 1 ? "" : "s"} don't appear on the map yet — location not set.
              </p>
            )}
          </div>
        ) : (
          <Honeycomb
            members={filteredMatches}
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
