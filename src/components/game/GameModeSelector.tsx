import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Timer, Infinity as InfinityIcon } from "lucide-react";
import type { GameConfig, GameMode } from "@/lib/game/types";

interface Props {
  open: boolean;
  onCancel?: () => void;
  onChoose: (mode: GameMode, config: GameConfig) => void;
}

export function GameModeSelector({ open, onCancel, onChoose }: Props) {
  const [mode, setMode] = useState<GameMode>("end_of_days");
  const [targetScore, setTargetScore] = useState(50);
  const [matchMinutes, setMatchMinutes] = useState(20);
  const [turnSeconds, setTurnSeconds] = useState(20);

  const cards: Array<{
    id: GameMode;
    title: string;
    sub: string;
    icon: JSX.Element;
  }> = [
    {
      id: "first_to_50",
      title: "Top Score",
      sub: "First player to reach the top score limit wins.",
      icon: <Trophy className="w-6 h-6" />,
    },
    {
      id: "beat_clock",
      title: "Beat the Clock",
      sub: "Match timer + per-turn timer. Highest score on time-up.",
      icon: <Timer className="w-6 h-6" />,
    },
    {
      id: "end_of_days",
      title: "End of Days",
      sub: "Classic full game — build your complete ecosystem to win.",
      icon: <InfinityIcon className="w-6 h-6" />,
    },
  ];

  function confirm() {
    const config: GameConfig = {};
    if (mode === "first_to_50") config.targetScore = targetScore;
    if (mode === "beat_clock") {
      config.matchEndsAt = Date.now() + matchMinutes * 60_000;
      config.turnSeconds = turnSeconds;
    }
    onChoose(mode, config);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Choose a Game Type</DialogTitle>
          <DialogDescription>Pick how this match ends.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
          {cards.map((c) => {
            const active = mode === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setMode(c.id)}
                className={
                  "text-left rounded-lg border p-3 transition-all flex flex-col gap-2 " +
                  (active
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border hover:border-primary/50 bg-card/40")
                }
              >
                <div className="flex items-center gap-2">
                  {c.icon}
                  <span className="font-display text-base">{c.title}</span>
                </div>
                <span className="text-xs text-muted-foreground leading-snug">{c.sub}</span>
              </button>
            );
          })}
        </div>

        {mode === "first_to_50" && (
          <div className="flex items-center gap-3 py-1">
            <Label htmlFor="ts" className="text-sm">Top score limit (pts)</Label>
            <Input
              id="ts"
              type="number"
              min={10}
              max={500}
              value={targetScore}
              onChange={(e) => setTargetScore(Math.max(10, Number(e.target.value) || 0))}
              className="w-28"
            />
            <span className="text-xs text-muted-foreground">First to reach this wins.</span>
          </div>
        )}

        {mode === "beat_clock" && (
          <div className="flex flex-wrap items-center gap-4 py-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="mm" className="text-sm">Match (minutes)</Label>
              <Input
                id="mm"
                type="number"
                min={1}
                max={120}
                value={matchMinutes}
                onChange={(e) => setMatchMinutes(Math.max(1, Number(e.target.value) || 0))}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ts2" className="text-sm">Per turn (seconds)</Label>
              <Input
                id="ts2"
                type="number"
                min={5}
                max={300}
                value={turnSeconds}
                onChange={(e) => setTurnSeconds(Math.max(5, Number(e.target.value) || 0))}
                className="w-24"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          )}
          <Button onClick={confirm}>Start match</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
