import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useGameSettings } from "@/lib/game/settings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface Props {
  userId: string;
}

/** Shows a one-time pop-up CTA when the player crosses a discount threshold
 *  (50 / 100 / 200 pts by default — configurable in game_settings). */
export default function PlayerProfileDiscountCTA({ userId }: Props) {
  const { settings } = useGameSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activePct, setActivePct] = useState<number>(0);
  const [activeThreshold, setActiveThreshold] = useState<number>(0);

  useEffect(() => {
    if (!settings.profile_discount_enabled || !userId) return;

    (async () => {
      const { data } = await supabase
        .from("player_progress")
        .select("points")
        .eq("user_id", userId)
        .maybeSingle();
      const pts = data?.points ?? 0;

      const tiers = [
        { t: settings.profile_discount_threshold_3, p: settings.profile_discount_percent_3 },
        { t: settings.profile_discount_threshold_2, p: settings.profile_discount_percent_2 },
        { t: settings.profile_discount_threshold_1, p: settings.profile_discount_percent_1 },
      ].sort((a, b) => b.t - a.t);

      for (const tier of tiers) {
        if (pts >= tier.t) {
          const key = `profile_discount_seen_${userId}_${tier.t}`;
          if (typeof window !== "undefined" && !window.localStorage.getItem(key)) {
            setActiveThreshold(tier.t);
            setActivePct(tier.p);
            setOpen(true);
            window.localStorage.setItem(key, "1");
          }
          return; // only show the highest unseen tier
        }
      }
    })();
  }, [userId, settings]);

  function close() { setOpen(false); }

  function goUpgrade() {
    setOpen(false);
    navigate(`/enroll?discount=${activePct}`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-6 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3" />
          <div className="text-[11px] uppercase tracking-widest opacity-90 mb-1">
            {activeThreshold} pts unlocked
          </div>
          <div className="text-3xl font-display font-bold leading-tight">
            {activePct}% off your profiling
          </div>
        </div>
        <div className="p-6 space-y-4 text-center">
          <h3 className="text-lg font-display font-semibold">
            {settings.profile_discount_cta_title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {settings.profile_discount_cta_body}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={goUpgrade} size="lg">
              Claim {activePct}% off
            </Button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Maybe later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
