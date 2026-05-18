import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIERS, type TierKey } from "@/lib/tiers";
import { ArrowRight, BookOpen, CircleHelp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sortCreatorTypes } from "@/lib/creatorTypes";
import welcomeBg from "@/assets/welcome-bg.png";

import wrenImg from "@/assets/bird-wren.png";
import robinImg from "@/assets/bird-robin.png";
import falconImg from "@/assets/bird-falcon.png";
import owlImg from "@/assets/bird-owl.png";

const TIER_BIRDS: Record<string, string> = {
  wren: wrenImg,
  robin: robinImg,
  falcon: falconImg,
  owl: owlImg,
};

const GLYPH_IMPORTS: Record<string, () => Promise<{ default: string }>> = {
  lava: () => import("@/assets/glyph-lava.png"),
  fire: () => import("@/assets/glyph-fire.png"),
  whirlwind: () => import("@/assets/glyph-whirlwind.png"),
  sun: () => import("@/assets/glyph-sun.png"),
  lightning: () => import("@/assets/glyph-lightning.png"),
  sky: () => import("@/assets/glyph-sky.png"),
  mountain: () => import("@/assets/glyph-mountain.png"),
  tree: () => import("@/assets/glyph-tree.png"),
  soil: () => import("@/assets/glyph-soil.png"),
  river: () => import("@/assets/glyph-river.png"),
  ocean: () => import("@/assets/glyph-ocean.png"),
  lake: () => import("@/assets/glyph-lake.png"),
  snow: () => import("@/assets/glyph-snow.png"),
};

interface WelcomeHeroProps {
  firstName?: string | null;
  tier?: TierKey | null;
  subscriptionStatus?: string | null;
  statusLabel: string;
  statusColor: string;
  creatorTypes?: string[];
  showStatusBadge?: boolean;
  enrollmentStep?: string | null;
  country?: string | null;
  showBooking?: boolean;
}

export default function WelcomeHero({ firstName, tier, subscriptionStatus, statusLabel, statusColor, creatorTypes = [], showStatusBadge = true, enrollmentStep, country, showBooking = false }: WelcomeHeroProps) {
  const tierData = tier ? TIERS[tier] : null;
  const birdSrc = tier ? TIER_BIRDS[tier] : null;

  const [glyphs, setGlyphs] = useState<{ name: string; url: string; color: string }[]>([]);

  useEffect(() => {
    if (creatorTypes.length === 0) return;

    async function loadGlyphs() {
      const sorted = sortCreatorTypes(creatorTypes);
      const capitalised = sorted.map(n => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
      const matchSet = [...new Set([...sorted, ...capitalised])];
      const { data: typesData } = await supabase
        .from("creator_types")
        .select("name, color_hex")
        .in("name", matchSet);

      const colorMap: Record<string, string> = {};
      typesData?.forEach(t => {
        colorMap[t.name.toLowerCase()] = t.color_hex || "hsl(var(--primary))";
      });

      const results: { name: string; url: string; color: string }[] = [];
      for (const name of sorted) {
        const key = name.toLowerCase();
        if (GLYPH_IMPORTS[key]) {
          try {
            const mod = await GLYPH_IMPORTS[key]();
            results.push({ name, url: mod.default, color: colorMap[key] || "hsl(var(--primary))" });
          } catch { /* skip */ }
        }
      }
      setGlyphs(results);
    }
    loadGlyphs();
  }, [creatorTypes]);

  // Determine "What's Next?" prompt
  const getNextStep = () => {
    if (!enrollmentStep || enrollmentStep === "plan_selected" || enrollmentStep === "signed_up")
      return { label: "Complete your personal details", link: "/enroll/details" };
    if (enrollmentStep === "payment_complete")
      return { label: "Upload your profiling photos", link: "/enroll/photos" };
    if (enrollmentStep === "photos_uploaded" && showBooking)
      return { label: "Book your profiling session", link: "/enroll/booking" };
    if (enrollmentStep === "photos_uploaded" && !showBooking)
      return { label: "Your photos are being reviewed", link: null };
    if (enrollmentStep === "booking_made" || enrollmentStep === "awaiting_profiling")
      return { label: "Your profile is being reviewed", link: null };
    return null; // complete
  };
  const nextStep = getNextStep();

  const isAustralia = country?.toLowerCase().includes("australia") || country?.toLowerCase() === "au";

  return (
    <div className="space-y-3">
      {/* Main welcome box */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 p-6 sm:p-8 shadow-lg shadow-primary/5">
        <img src={welcomeBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
        <div className="absolute inset-0 bg-card/60" />
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-secondary/15 blur-2xl" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 rounded-full bg-accent/10 blur-xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              Welcome{firstName ? `, ${firstName}` : ""}!
            </h1>
            {showStatusBadge && <Badge className={statusColor}>{statusLabel}</Badge>}
          </div>
          {glyphs.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {glyphs.map(g => (
                <div
                  key={g.name}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center p-1"
                  style={{ backgroundColor: `${g.color}20` }}
                  title={g.name}
                >
                  <img src={g.url} alt={g.name} className="w-full h-full object-contain" />
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground max-w-md">
            Your Creator Type profiling journey — track your progress, view your photos, and discover your unique profile.
          </p>
          {tierData && (
            <div className="flex items-center gap-2 pt-1">
              {birdSrc && (
                <img
                  src={birdSrc}
                  alt={tierData.name || "Tier"}
                  className="w-8 h-8 object-contain"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="text-sm font-semibold text-foreground">
                {tierData.name} <span className="text-muted-foreground font-normal">· {tierData.subtitle}</span>
              </span>
              {subscriptionStatus && (
                <span className="text-xs text-muted-foreground capitalize">({subscriptionStatus})</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* What's Next? — separate box */}
      {nextStep && (
        <div className="rounded-2xl border border-orange-300/30 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
              <CircleHelp className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">What's Next?</span>
              <p className="text-xs text-muted-foreground">{nextStep.label}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {nextStep.link && (
              <Button size="sm" className="w-full sm:w-auto justify-center bg-orange-500 hover:bg-orange-600 text-white" asChild>
                <a href={nextStep.link}>Continue <ArrowRight className="h-3 w-3 ml-1" /></a>
              </Button>
            )}
            {isAustralia && (
              <Button variant="outline" size="sm" className="w-full sm:w-auto justify-center gap-1.5 shrink-0 border-orange-400/40 text-orange-600 hover:bg-orange-500/10" asChild>
                <a href="https://www.paypal.com/ncp/payment/Q5UNQG7THTWQW" target="_blank" rel="noopener noreferrer">
                  <BookOpen className="h-3.5 w-3.5" />
                  Buy the Book
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Book button when enrollment is complete but user is in Australia */}
      {!nextStep && isAustralia && (
        <div className="rounded-2xl border border-orange-300/30 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">13Creators Book</span>
              <p className="text-xs text-muted-foreground">Get your copy of the 13Creators book</p>
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0 border-orange-400/40 text-orange-600 hover:bg-orange-500/10" asChild>
              <a href="https://www.paypal.com/ncp/payment/Q5UNQG7THTWQW" target="_blank" rel="noopener noreferrer">
                <BookOpen className="h-3.5 w-3.5" />
                Buy Now
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
