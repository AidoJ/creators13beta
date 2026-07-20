import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

/**
 * ProfilingJourneyBlock
 *
 * Renders the "profiling journey" surface on the Me/profile page. The block
 * IS the status — not a promo box — and its shape depends on the user's
 * signup path + current progress:
 *
 *   - Player-path, unprofiled → discovery framing + one-tap route to the
 *     context-aware two-option chooser (/enroll?upgrade=true). If the user
 *     has an unredeemed profile discount code we surface "Your N% discount
 *     is waiting" pointing at the same destination.
 *
 *   - Profiled (creator types confirmed) → the user's actual Creator Type
 *     as the headline. Reward display; no CTA.
 *
 *   - Case-study volunteer or paying client mid-journey → renders NOTHING.
 *     Those states are already covered by ProgressCard / SessionCard on the
 *     Me page and are explicitly unchanged.
 *
 * Funnel instrumentation reuses the milestone-prompt columns so we can
 * compare which surface converts: on first render for player-path
 * unprofiled users we stamp profiling_prompt_shown_at (+ trigger='me_page')
 * IF the milestone dialog hasn't already fired. On tap we stamp
 * profiling_prompt_tapped_at. Payment.tsx handles reached_checkout.
 */
interface Props {
  userId: string;
  isPlayerPath: boolean;
  isCaseStudy: boolean;
  isPaidTier: boolean;
  creatorTypes: string[];
}

export default function ProfilingJourneyBlock({
  userId,
  isPlayerPath,
  isCaseStudy,
  isPaidTier,
  creatorTypes,
}: Props) {
  const navigate = useNavigate();
  const isProfiled = creatorTypes.length > 0;
  const [discount, setDiscount] = useState<{ code: string; percent: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Which state do we render?
  const variant = useMemo<"profiled" | "player-unprofiled" | null>(() => {
    if (isProfiled) return "profiled";
    // Case-study & paying mid-journey are handled by ProgressCard/SessionCard.
    if (isCaseStudy || isPaidTier) return null;
    if (isPlayerPath) return "player-unprofiled";
    return null;
  }, [isProfiled, isCaseStudy, isPaidTier, isPlayerPath]);

  // Fetch best unredeemed discount code + fire the "shown" funnel event once
  // (only for the player-unprofiled variant, and only if the milestone dialog
  // hasn't already claimed the shown_at slot).
  useEffect(() => {
    if (!userId || variant !== "player-unprofiled") { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const [codesRes, profRes] = await Promise.all([
        supabase
          .from("profile_discount_codes" as any)
          .select("code, percent, redeemed_at")
          .eq("user_id", userId)
          .is("redeemed_at", null)
          .order("percent", { ascending: false })
          .limit(1),
        supabase
          .from("profiles")
          .select("profiling_prompt_shown_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const row = (codesRes.data as any[])?.[0];
      if (row) setDiscount({ code: row.code, percent: row.percent });

      if (!(profRes.data as any)?.profiling_prompt_shown_at) {
        await supabase
          .from("profiles")
          .update({
            profiling_prompt_shown_at: new Date().toISOString(),
            profiling_prompt_trigger: "me_page",
          } as any)
          .eq("user_id", userId);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, variant]);

  if (!variant) return null;

  if (variant === "profiled") {
    const headline = creatorTypes[0];
    const rest = creatorTypes.slice(1);
    return (
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          Your Creator Type
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-foreground leading-tight">
          {headline}
        </h2>
        {rest.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Also confirmed: {rest.join(" · ")}
          </p>
        )}
      </div>
    );
  }

  // variant === "player-unprofiled"
  const goToProfiling = async () => {
    // Only stamp tapped_at once — mirror ProfilingPromptDialog behaviour.
    await supabase
      .from("profiles")
      .update({ profiling_prompt_tapped_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
    // Player-path users routed to /enroll see the two-option (no game card)
    // chooser — NOT the cold three-way chooser. Discount code auto-applies
    // through the /enroll?discount=&code= handoff when present.
    if (discount) {
      navigate(`/enroll?upgrade=true&discount=${discount.percent}&code=${encodeURIComponent(discount.code)}`);
    } else {
      navigate("/enroll?upgrade=true");
    }
  };

  return (
    <button
      type="button"
      onClick={goToProfiling}
      className="w-full text-left rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 space-y-3 hover:border-primary/60 hover:bg-primary/10 transition-colors group"
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
        <Sparkles className="h-4 w-4" />
        Creator Type
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-xl md:text-2xl text-foreground leading-tight">
          Not yet discovered
        </h2>
        <p className="text-sm text-muted-foreground">
          Curious which of the 13 Creators you are?
        </p>
      </div>

      {discount && loaded && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold text-foreground">
            Your {discount.percent}% discount is waiting
          </span>
          <span className="text-muted-foreground"> — applied automatically at checkout.</span>
        </div>
      )}

      <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
        Explore profiling
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}
