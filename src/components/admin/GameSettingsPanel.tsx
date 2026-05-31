import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Save, RotateCcw, Trophy, Timer, Gamepad2 } from "lucide-react";
import { DEFAULT_GAME_SETTINGS, invalidateGameSettings, type GameSettings } from "@/lib/game/settings";

type Num = keyof Pick<GameSettings,
  "points_per_win" | "elo_win" | "elo_loss" | "perfect_eco_bonus"
  | "top_score_default" | "beat_clock_match_minutes" | "beat_clock_turn_seconds"
  | "hand_size" | "hand_limit" | "ecosystem_target" | "creators_needed" | "animals_per_creator">;

type Bool = keyof Pick<GameSettings,
  "mode_end_of_days_enabled" | "mode_top_score_enabled" | "mode_beat_clock_enabled"
  | "enable_disasters" | "enable_golden_hive" | "enable_sky_creator" | "enable_golden_body" | "enable_sky_creature_steal">;

export default function GameSettingsPanel() {
  const [s, setS] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("game_settings" as any).select("*").eq("id", "global").maybeSingle();
      if (data) setS({ ...DEFAULT_GAME_SETTINGS, ...(data as any) });
      setLoading(false);
    })();
  }, []);

  function setNum(k: Num, v: string) {
    const n = Number(v);
    setS((p) => ({ ...p, [k]: Number.isFinite(n) ? n : p[k] }));
  }
  function setBool(k: Bool, v: boolean) { setS((p) => ({ ...p, [k]: v })); }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("game_settings" as any)
      .upsert({ ...s, id: "global", updated_at: new Date().toISOString() } as any, { onConflict: "id" });
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else {
      invalidateGameSettings();
      toast({ title: "Game settings saved" });
    }
  }

  function reset() { setS(DEFAULT_GAME_SETTINGS); }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game settings…</div>;

  const NumField = ({ k, label, min, max, hint }: { k: Num; label: string; min?: number; max?: number; hint?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={s[k]} onChange={(e) => setNum(k, e.target.value)} className="h-8" />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const BoolField = ({ k, label, hint }: { k: Bool; label: string; hint?: string }) => (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
      <div>
        <Label className="text-xs">{label}</Label>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={s[k]} onCheckedChange={(v) => setBool(k, v)} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Scoring */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Scoring & Progression</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumField k="points_per_win" label="Points per game won" min={0} max={100} hint="Dashboard pts awarded to winner" />
          <NumField k="elo_win" label="ELO gain on win" min={0} max={200} />
          <NumField k="elo_loss" label="ELO change on loss" min={-200} max={0} hint="Use negative number" />
          <NumField k="perfect_eco_bonus" label="Perfect ecosystem bonus" min={0} max={100} hint="Extra pts for full 16-card eco" />
        </div>
      </section>

      {/* Game Modes */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Timer className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Game Modes</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <BoolField k="mode_end_of_days_enabled" label="End of Days" hint="Classic full ecosystem build" />
          <BoolField k="mode_top_score_enabled" label="Top Score" hint="First to reach point limit" />
          <BoolField k="mode_beat_clock_enabled" label="Beat the Clock" hint="Match + per-turn timers" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Default mode</Label>
            <Select value={s.default_mode} onValueChange={(v) => setS((p) => ({ ...p, default_mode: v as GameSettings["default_mode"] }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="end_of_days">End of Days</SelectItem>
                <SelectItem value="first_to_50">Top Score</SelectItem>
                <SelectItem value="beat_clock">Beat the Clock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField k="top_score_default" label="Top Score default (pts)" min={10} max={500} />
          <NumField k="beat_clock_match_minutes" label="Beat the Clock match (min)" min={1} max={120} />
          <NumField k="beat_clock_turn_seconds" label="Beat the Clock per turn (sec)" min={5} max={300} />
        </div>
      </section>

      {/* Match Rules */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gamepad2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Match Rules</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <NumField k="hand_size" label="Opening hand size" min={1} max={20} />
          <NumField k="hand_limit" label="Hand limit" min={1} max={30} />
          <NumField k="ecosystem_target" label="Ecosystem target" min={4} max={32} />
          <NumField k="creators_needed" label="Creators needed" min={1} max={10} />
          <NumField k="animals_per_creator" label="Animals per creator" min={1} max={10} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BoolField k="enable_disasters" label="Disasters" hint="Allow Creator-as-disaster plays" />
          <BoolField k="enable_golden_hive" label="Golden Hive" hint="Shield card that blocks one disaster" />
          <BoolField k="enable_sky_creator" label="Sky Creator" hint="Wildcard creator (any element)" />
          <BoolField k="enable_golden_body" label="Golden Body" hint="Wildcard animal" />
          <BoolField k="enable_sky_creature_steal" label="Sky Creature steal" hint="Mythical animal stealer action" />
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset to defaults</Button>
        <Button size="sm" onClick={save} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? "Saving…" : "Save settings"}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Note: Match Rules toggles for hand size, ecosystem target and special cards apply to newly created matches only. Active matches keep the rules they were started with.
      </p>
    </div>
  );
}
