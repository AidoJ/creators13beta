import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trophy, Eye } from "lucide-react";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { glyphForType } from "@/lib/game/glyphs";
import { Ecosystem } from "@/components/game/Ecosystem";
import type { MatchState, PlayerState } from "@/lib/game/types";
import { playerTotalScore } from "@/lib/game/types";
import { validateEcosystemWin } from "@/lib/game/engine";

function buildWinReason(state: MatchState, winner: PlayerState): { headline: string; detail: string } {
  const eco = validateEcosystemWin(winner);
  const score = playerTotalScore(winner);
  let creators = 0;
  let animals = 0;
  for (const pc of winner.ecosystem.placed.values()) {
    if (pc.card.kind === "creator" || pc.card.kind === "sky_creator") creators++;
    else animals++;
  }
  if (eco.valid) {
    return {
      headline: "Completed a valid ecosystem",
      detail: `${winner.name} placed all 16 cards — 4 Creators covering every element (Earth, Fire, Air, Water) and 12 Animals correctly assigned (3 per Creator) — finishing on ${score} pts.`,
    };
  }
  if (state.gameMode === "first_to_50") {
    const target = state.gameConfig?.targetScore ?? 50;
    if (score >= target) {
      return {
        headline: `Reached the ${target}-point target first`,
        detail: `${winner.name} crossed the ${target}-pt threshold with ${score} pts (${creators}/4 Creators, ${animals}/12 Animals placed) before any opponent could complete an ecosystem.`,
      };
    }
  }
  if (state.gameMode === "beat_clock") {
    return {
      headline: "Highest score when time ran out",
      detail: `Time expired before anyone completed an ecosystem. ${winner.name} led on points with ${score} pts (${creators}/4 Creators, ${animals}/12 Animals placed).`,
    };
  }
  return {
    headline: "Highest score at match end",
    detail: `The deck ran out before anyone could complete an ecosystem. ${winner.name} led with ${score} pts (${creators}/4 Creators, ${animals}/12 Animals placed).`,
  };
}

interface Props {
  state: MatchState;
  onPlayAgain: () => void;
}

export function MatchOverDialog({ state, onPlayAgain }: Props) {
  const navigate = useNavigate();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = state.finished && !dismissed;
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  return (
    <>
      <Dialog open={open && !reviewOpen} onOpenChange={(o) => { if (!o) setDismissed(true); }}>

        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-2xl">
              <Trophy className="w-6 h-6 text-amber-500" />
              Congratulations {winner.name} — You Win!
            </DialogTitle>
            <DialogDescription>
              Match complete in {state.turnNumber} turns. Here's the final breakdown by Creator Type.
            </DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-4 mt-2">
            {state.players.map((p) => (
              <PlayerBreakdown key={p.id} player={p} winner={p.id === state.winnerId} />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            <Button variant="outline" onClick={() => setReviewOpen(true)}>
              <Eye className="w-4 h-4 mr-1.5" /> Review boards
            </Button>
            <Button onClick={onPlayAgain}>Play again</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open && reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Review final boards</DialogTitle>
            <DialogDescription>
              See how each player built (or didn't build) their ecosystem.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue={state.players[0]?.id}>
            <TabsList className="w-full">
              {state.players.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="flex-1">
                  {p.name}{p.id === state.winnerId ? " 🏆" : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {state.players.map((p) => (
              <TabsContent key={p.id} value={p.id} className="mt-4">
                <PlayerBreakdown player={p} winner={p.id === state.winnerId} />
                <div className="mt-3 rounded-lg border border-border/60 bg-card/40 p-2 overflow-auto">
                  <Ecosystem eco={p.ecosystem} size={56} showEmpties={false} minHeight={320} />
                </div>
              </TabsContent>
            ))}
          </Tabs>
          <div className="flex justify-end mt-4 gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Back to results</Button>
            <Button onClick={onPlayAgain}>Play again</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlayerBreakdown({ player, winner }: { player: PlayerState; winner: boolean }) {
  const CANONICAL_ORDER = ["Lava","Fire","Whirlwind","Snow","Lightning","Sun","Lake","Ocean","Tree","Mountain","Soil","River","Sky"];
  const counts = useMemo(() => {
    const creatorByType = new Map<string, number>();
    const animalByType = new Map<string, number>();
    let creators = 0;
    let animals = 0;
    for (const pc of player.ecosystem.placed.values()) {
      const k = pc.card.kind;
      const isCreator = k === "creator" || k === "sky_creator";
      if (isCreator) creators += 1; else animals += 1;
      const types = pc.card.types ?? [];
      // Sky Creator has no concrete type — bucket under "Sky"
      const effective = isCreator && k === "sky_creator" && types.length === 0 ? ["Sky"] : types;
      for (const t of effective) {
        const bucket = isCreator ? creatorByType : animalByType;
        bucket.set(t, (bucket.get(t) ?? 0) + 1);
      }
    }
    type Row = { type: string; role: "Creator" | "Animal"; n: number };
    const rows: Row[] = [];
    for (const t of CANONICAL_ORDER) {
      const c = creatorByType.get(t) ?? 0;
      const a = animalByType.get(t) ?? 0;
      if (c > 0) rows.push({ type: t, role: "Creator", n: c });
      if (a > 0) rows.push({ type: t, role: "Animal", n: a });
    }
    return { rows, creators, animals };
  }, [player]);

  return (
    <div
      className={`rounded-lg border p-3 ${
        winner ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold">{player.name}</div>
        <div className="text-xs text-muted-foreground">
          {counts.creators}/4 creators · {counts.animals}/12 animals · {playerTotalScore(player)} pts
        </div>
      </div>
      {counts.rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No cards placed.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {counts.rows.map(({ type, role, n }) => {
            const color = CREATOR_TYPE_COLORS[type as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
            const glyph = glyphForType(type);
            return (
              <div
                key={`${role}-${type}`}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ background: color }}
                title={`${role} · ${type}: ${n}`}
              >
                {glyph && <img src={glyph} alt="" className="w-3 h-3 object-contain" />}
                <span className="opacity-80">{role}</span>
                <span>{type}</span>
                <span className="opacity-80">×{n}</span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
