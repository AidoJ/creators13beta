import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Timer, Infinity as InfinityIcon, Bot } from "lucide-react";
import type { GameConfig, GameMode } from "@/lib/game/types";
import { useGameSettings } from "@/lib/game/settings";
import type { BotDifficulty } from "@/lib/game/bot";

interface Props {
  open: boolean;
  onCancel?: () => void;
  onChoose: (mode: GameMode, config: GameConfig, difficulty: BotDifficulty) => void;
}

export function GameModeSelector({ open, onCancel, onChoose }: Props) {
  const { settings } = useGameSettings();
  const [mode, setMode] = useState<GameMode>("end_of_days");
  const [targetScore, setTargetScore] = useState(50);
  const [matchMinutes, setMatchMinutes] = useState(20);
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");

  useEffect(() => {
    setMode(settings.default_mode as GameMode);
    setTargetScore(settings.top_score_default);
    setMatchMinutes(settings.beat_clock_match_minutes);
    setTurnSeconds(settings.beat_clock_turn_seconds);
    // Default difficulty = admin's bot_difficulty, unless that tier is disabled.
    const adminPref = settings.bot_difficulty;
    const enabled = (d: BotDifficulty) =>
      d === "easy" ? settings.bot_easy_enabled : d === "medium" ? settings.bot_medium_enabled : settings.bot_hard_enabled;
    if (enabled(adminPref)) setDifficulty(adminPref);
    else {
      const fallback: BotDifficulty = enabled("medium") ? "medium" : enabled("easy") ? "easy" : "hard";
      setDifficulty(fallback);
    }
  }, [settings]);

  const allCards: Array<{
    id: GameMode;
    title: string;
    sub: string;
    icon: JSX.Element;
    enabled: boolean;
  }> = [
    {
      id: "first_to_50",
      title: "Top Score",
      sub: "First player to reach the top score limit wins.",
      icon: <Trophy className="w-6 h-6" />,
      enabled: settings.mode_top_score_enabled,
    },
    {
      id: "beat_clock",
      title: "Beat the Clock",
      sub: "Match timer + per-turn timer. Highest score on time-up.",
      icon: <Timer className="w-6 h-6" />,
      enabled: settings.mode_beat_clock_enabled,
    },
    {
      id: "end_of_days",
      title: "End of Days",
      sub: "Classic full game — build your complete ecosystem to win.",
      icon: <InfinityIcon className="w-6 h-6" />,
      enabled: settings.mode_end_of_days_enabled,
    },
  ];
  const cards = allCards.filter((c) => c.enabled);

  function confirm() {
    const config: GameConfig = {};
    if (mode === "first_to_50") config.targetScore = targetScore;
    if (mode === "beat_clock") {
      config.matchEndsAt = Date.now() + matchMinutes * 60_000;
      config.matchMinutes = matchMinutes;
      config.turnSeconds = turnSeconds;
    }
    onChoose(mode, config, difficulty);
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

        {/* Bot difficulty — applies to solo vs bot only */}
        <div className="rounded-lg border border-border bg-card/40 p-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">Bot difficulty</Label>
            <span className="text-[11px] text-muted-foreground ml-auto">Bot games don't earn Points or affect ELO.</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["easy", "medium", "hard"] as const).map((d) => {
              const enabled = d === "easy" ? settings.bot_easy_enabled : d === "medium" ? settings.bot_medium_enabled : settings.bot_hard_enabled;
              if (!enabled) return null;
              const active = difficulty === d;
              const label = d === "easy" ? "Easy" : d === "medium" ? "Medium" : "Hard";
              const sub = d === "easy" ? "Forgiving — plays sub-optimal moves." : d === "medium" ? "Standard greedy play." : "Uses eligible Disasters as soon as allowed.";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={
                    "rounded-md border p-2 text-left transition-all " +
                    (active ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border hover:border-primary/50 bg-background")
                  }
                >
                  <div className="font-display text-sm">{label}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{sub}</div>
                </button>
              );
            })}
          </div>
        </div>


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
