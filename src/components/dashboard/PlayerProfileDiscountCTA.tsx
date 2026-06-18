import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useGameSettings } from "@/lib/game/settings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Download, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  userId: string;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `PROFILE-${out}`;
}

/** Shows a pop-up when the player crosses a discount threshold (50/100/200 pts).
 *  Issues a one-time, profiling-only discount code that the player can copy or download. */
export default function PlayerProfileDiscountCTA({ userId }: Props) {
  const { settings } = useGameSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activePct, setActivePct] = useState<number>(0);
  const [activeThreshold, setActiveThreshold] = useState<number>(0);
  const [code, setCode] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!settings.profile_discount_enabled || !userId) return;

    (async () => {
      const { data: pp } = await supabase
        .from("player_progress")
        .select("points")
        .eq("user_id", userId)
        .maybeSingle();
      const pts = pp?.points ?? 0;

      const tiers = [
        { t: settings.profile_discount_threshold_3, p: settings.profile_discount_percent_3 },
        { t: settings.profile_discount_threshold_2, p: settings.profile_discount_percent_2 },
        { t: settings.profile_discount_threshold_1, p: settings.profile_discount_percent_1 },
      ].sort((a, b) => b.t - a.t);

      const { data: existing } = await supabase
        .from("profile_discount_codes" as any)
        .select("code, threshold, percent")
        .eq("user_id", userId);
      const existingMap = new Map<number, { code: string; percent: number }>();
      (existing as any[] | null)?.forEach((r) => existingMap.set(r.threshold, { code: r.code, percent: r.percent }));

      for (const tier of tiers) {
        if (pts >= tier.t) {
          const dismissKey = `profileDiscountDismiss:${userId}:${tier.t}`;
          if (typeof window !== "undefined" && localStorage.getItem(dismissKey) === "1") {
            return; // user opted out of this tier's pop-up
          }
          let codeRow = existingMap.get(tier.t);
          if (!codeRow) {
            let newCode = randomCode();
            for (let i = 0; i < 4; i++) {
              const { data: ins, error } = await supabase
                .from("profile_discount_codes" as any)
                .insert({ user_id: userId, code: newCode, percent: tier.p, threshold: tier.t, scope: "profiling_only" })
                .select("code, percent")
                .single();
              if (!error && ins) {
                codeRow = ins as any;
                break;
              }
              newCode = randomCode();
            }
          }
          if (codeRow) {
            setActiveThreshold(tier.t);
            setActivePct(codeRow.percent);
            setCode(codeRow.code);
            setOpen(true);
          }
          return;
        }
      }
    })();
  }, [userId, settings]);

  function close() {
    setOpen(false);
  }

  function dontShowAgain() {
    if (typeof window !== "undefined" && userId && activeThreshold) {
      localStorage.setItem(`profileDiscountDismiss:${userId}:${activeThreshold}`, "1");
    }
    toast({ title: "Got it", description: "We won't show this again. Find your code anytime under 'Your discount codes' on your dashboard." });
    close();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Code copied", description: code });
    } catch {
      toast({ title: "Could not copy", description: code, variant: "destructive" });
    }
  }

  function downloadCode() {
    const body = [
      "13 Creators — Profile Discount Code",
      "",
      `Code:        ${code}`,
      `Discount:    ${activePct}% off your profiling assessment`,
      `Earned at:   ${activeThreshold} game points`,
      `Valid for:   Profiling assessment ONLY`,
      `Not valid:   on any subscription (Wren / Robin / Falcon / Owl)`,
      `Issued:      ${new Date().toLocaleString()}`,
      "",
      "Enter this code at checkout when purchasing your profiling assessment.",
      "One-time use. Non-transferable.",
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `13creators-profile-discount-${code}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function goUpgrade() {
    close();
    navigate(`/enroll?discount=${activePct}&code=${encodeURIComponent(code)}`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-4 text-center shrink-0">
          <Sparkles className="w-7 h-7 mx-auto mb-1.5" />
          <div className="text-[10px] uppercase tracking-widest opacity-90">
            {activeThreshold} pts unlocked
          </div>
          <div className="text-2xl font-display font-bold leading-tight">
            {activePct}% off your profiling
          </div>
        </div>
        <div className="p-4 space-y-3 text-center overflow-y-auto">
          <h3 className="text-base font-display font-semibold">
            {settings.profile_discount_cta_title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {settings.profile_discount_cta_body}
          </p>

          {/* One-time code */}
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
              Your one-time code
            </div>
            <div className="font-mono text-lg font-bold tracking-wider text-foreground select-all">
              {code || "—"}
            </div>
            <div className="flex gap-2 justify-center mt-2">
              <Button size="sm" variant="outline" onClick={copyCode} disabled={!code} className="h-7 text-xs">
                {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="outline" onClick={downloadCode} disabled={!code} className="h-7 text-xs">
                <Download className="w-3 h-3 mr-1" /> Download
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              Profile assessment only — <strong>not valid on subscriptions</strong>. One-time use.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 pt-0.5">
            <Button onClick={goUpgrade} size="sm">
              Use {activePct}% off now
            </Button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={dontShowAgain}
              className="text-[11px] text-muted-foreground/80 hover:text-foreground underline underline-offset-2"
            >
              Don't show again
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
