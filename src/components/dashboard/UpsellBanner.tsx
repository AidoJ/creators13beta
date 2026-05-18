import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { TIERS, type TierKey } from "@/lib/tiers";

interface UpsellBannerProps {
  currentTier?: TierKey | null;
}

const UPGRADE_MAP: Record<string, { target: TierKey; message: string }> = {
  wren: {
    target: "robin",
    message: "Upgrade to Robin to unlock full Creator Type profiling, 1-on-1 Zoom sessions, and personalised insights.",
  },
  robin: {
    target: "falcon",
    message: "Level up to Falcon for ongoing coaching, advanced profiling insights, and priority booking.",
  },
};

export default function UpsellBanner({ currentTier }: UpsellBannerProps) {
  const navigate = useNavigate();
  const upgrade = currentTier ? UPGRADE_MAP[currentTier] : null;

  if (!upgrade) return null;

  const targetTier = TIERS[upgrade.target];

  return (
    <div className="rounded-2xl border border-secondary/30 bg-gradient-to-r from-secondary/5 via-secondary/10 to-primary/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-secondary" />
          Unlock More with {targetTier.name}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md">{upgrade.message}</p>
      </div>
      <Button
        size="sm"
        className="rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90 shrink-0"
        onClick={() => navigate("/enroll")}
      >
        Upgrade <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
      </Button>
    </div>
  );
}
