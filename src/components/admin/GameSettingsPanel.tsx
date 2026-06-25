import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Save, RotateCcw, Trophy, Timer, Gamepad2, Bot, Eye, Library, AlertTriangle, ExternalLink, Pencil, Percent } from "lucide-react";
import { DEFAULT_GAME_SETTINGS, invalidateGameSettings, type GameSettings } from "@/lib/game/settings";
import CardEditorDialog from "./CardEditorDialog";
import CreatorContentEditor from "./CreatorContentEditor";

type Num = keyof Pick<GameSettings,
  "points_per_win" | "elo_win" | "elo_loss" | "perfect_eco_bonus"
  | "top_score_default" | "beat_clock_match_minutes" | "beat_clock_turn_seconds" | "beat_clock_draw_seconds"
  | "hand_size" | "hand_limit" | "ecosystem_target" | "creators_needed" | "animals_per_creator"
  | "bot_think_ms" | "max_players_per_match"
  | "profile_discount_threshold_1" | "profile_discount_percent_1"
  | "profile_discount_threshold_2" | "profile_discount_percent_2"
  | "profile_discount_threshold_3" | "profile_discount_percent_3">;

type Bool = keyof Pick<GameSettings,
  "mode_end_of_days_enabled" | "mode_top_score_enabled" | "mode_beat_clock_enabled"
  | "enable_disasters" | "enable_golden_hive" | "enable_sky_creator" | "enable_golden_body" | "enable_sky_creature_steal"
  | "allow_guest_play" | "allow_solo_vs_bot"
  | "bot_easy_enabled" | "bot_medium_enabled" | "bot_hard_enabled"
  | "show_tutorial_overlay" | "show_review_boards" | "prompt_player_name" | "show_score_panel"
  | "maintenance_banner_enabled" | "play_disabled" | "profile_discount_enabled">;

export default function GameSettingsPanel() {
  const [s, setS] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetting, setResetting] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);

  // Edit player points
  const [editEmail, setEditEmail] = useState("");
  const [editPoints, setEditPoints] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase.from("game_settings" as any).select("*").eq("id", "global").maybeSingle(),
        supabase.from("game_cards").select("id", { count: "exact", head: true }),
      ]);
      if (data) setS({ ...DEFAULT_GAME_SETTINGS, ...(data as any) });
      setCardCount(count ?? null);
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

  async function resetPlayer() {
    const email = resetEmail.trim().toLowerCase();
    if (!email) return;
    setResetting(true);
    const { data: prof } = await supabase.from("profiles").select("user_id").eq("email", email).maybeSingle();
    if (!prof?.user_id) {
      setResetting(false);
      toast({ title: "User not found", description: "No profile matches that email.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("admin_reset_player_progress" as any, { _user_id: prof.user_id });
    setResetting(false);
    if (error) toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    else {
      setResetEmail("");
      toast({ title: "Progress reset", description: `Cleared game progress for ${email}.` });
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game settings…</div>;

  async function lookupPlayer() {
    const email = editEmail.trim().toLowerCase();
    if (!email) return;
    setEditLoading(true);
    const { data: prof } = await supabase.from("profiles").select("user_id").eq("email", email).maybeSingle();
    if (!prof?.user_id) {
      setEditLoading(false);
      toast({ title: "User not found", description: "No profile matches that email.", variant: "destructive" });
      return;
    }
    const { data: prog } = await supabase.from("player_progress").select("points").eq("user_id", prof.user_id).maybeSingle();
    setEditUserId(prof.user_id);
    setEditPoints(String(prog?.points ?? 0));
    setEditLoading(false);
  }

  async function savePlayerPoints() {
    if (!editUserId) return;
    const points = Number(editPoints);
    if (!Number.isFinite(points) || points < 0) {
      toast({ title: "Invalid points", description: "Enter a non-negative number.", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    const { error } = await supabase.from("player_progress").update({ points, updated_at: new Date().toISOString() }).eq("user_id", editUserId);
    setEditSaving(false);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else toast({ title: "Points updated", description: `Player now has ${points} points.` });
  }

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
          <NumField k="beat_clock_draw_seconds" label="Beat the Clock draw phase (sec)" min={3} max={120} />
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
          <BoolField k="enable_golden_hive" label="Golden Hive Card" hint="Blocks one Disaster when held by the victim" />
          <BoolField k="enable_sky_creator" label="Sky Creator Card" hint="Substitutes for a Creator of any element" />
          <BoolField k="enable_golden_body" label="Golden Body Card" hint="Counts as a matching Animal for any Creator" />
          <BoolField k="enable_sky_creature_steal" label="Sky Creature steal" hint="Discard a Sky Creature to steal an opponent's Animal" />

        </div>
      </section>

      {/* Bots & Matchmaking */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Bots & Matchmaking</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Default bot difficulty</Label>
            <Select value={s.bot_difficulty} onValueChange={(v) => setS((p) => ({ ...p, bot_difficulty: v as GameSettings["bot_difficulty"] }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField k="bot_think_ms" label="Bot think-time (ms)" min={0} max={5000} hint="Delay between bot actions" />
          <NumField k="max_players_per_match" label="Max players per match" min={2} max={6} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <BoolField k="allow_guest_play" label="Allow guest play" hint="Unauthenticated visitors can play" />
          <BoolField k="allow_solo_vs_bot" label="Allow solo vs bot" hint="Single-player vs CPU opponents" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BoolField k="bot_easy_enabled" label="Easy tier" hint="Players can pick Easy bot" />
          <BoolField k="bot_medium_enabled" label="Medium tier" hint="Players can pick Medium bot" />
          <BoolField k="bot_hard_enabled" label="Hard tier" hint="Players can pick Hard bot" />
        </div>
      </section>

      {/* UI / UX */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">UI / UX</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <BoolField k="show_tutorial_overlay" label="Tutorial overlay" hint="First-time onboarding tips" />
          
          <BoolField k="show_review_boards" label="Review opponents dialog" hint="End-of-match tabbed boards" />
          <BoolField k="prompt_player_name" label="Prompt player name" hint="Ask new players for a display name" />
          <BoolField k="show_score_panel" label="Score panel" hint="Live in-match score widget" />
        </div>
        <div className="space-y-1 max-w-xs">
          <Label className="text-xs">Featured mode (optional)</Label>
          <Select
            value={s.featured_mode ?? "none"}
            onValueChange={(v) => setS((p) => ({ ...p, featured_mode: v === "none" ? null : (v as GameSettings["featured_mode"]) }))}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="end_of_days">End of Days</SelectItem>
              <SelectItem value="first_to_50">Top Score</SelectItem>
              <SelectItem value="beat_clock">Beat the Clock</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Highlighted in the mode picker.</p>
        </div>
      </section>

      {/* Content / Deck Composition */}
      <DeckCompositionSection />

      {/* Creator card back-of-card content */}
      <CreatorContentEditor />

      {/* Profile-discount CTA on Player Dashboard */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Percent className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Profile Discount CTA (Player Dashboard)</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Pops up once when a player crosses a points threshold, offering a discount on getting personally profiled. Discount is applied at checkout via the URL parameter.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <BoolField k="profile_discount_enabled" label="Enable discount popup" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="space-y-1">
            <Label className="text-xs">Popup title</Label>
            <Input
              value={s.profile_discount_cta_title}
              onChange={(e) => setS((p) => ({ ...p, profile_discount_cta_title: e.target.value }))}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Popup body</Label>
            <Textarea
              rows={2}
              value={s.profile_discount_cta_body}
              onChange={(e) => setS((p) => ({ ...p, profile_discount_cta_body: e.target.value }))}
              className="text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <NumField k="profile_discount_threshold_1" label="Tier 1 points" min={0} max={10000} />
          <NumField k="profile_discount_percent_1" label="Tier 1 % off" min={0} max={100} />
          <NumField k="profile_discount_threshold_2" label="Tier 2 points" min={0} max={10000} />
          <NumField k="profile_discount_percent_2" label="Tier 2 % off" min={0} max={100} />
          <NumField k="profile_discount_threshold_3" label="Tier 3 points" min={0} max={10000} />
          <NumField k="profile_discount_percent_3" label="Tier 3 % off" min={0} max={100} />
        </div>
      </section>

      {/* Live Ops */}
      <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h3 className="text-sm font-semibold">Live Operations</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <BoolField k="maintenance_banner_enabled" label="Show maintenance banner" hint="Sticky banner at top of /play" />
          <BoolField k="play_disabled" label="Disable Play page" hint="Hard kill-switch — blocks all new matches" />
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <Label className="text-xs">Maintenance banner text</Label>
            <Textarea
              value={s.maintenance_banner_text}
              onChange={(e) => setS((p) => ({ ...p, maintenance_banner_text: e.target.value }))}
              rows={2}
              placeholder="e.g. New patch deploying at 9pm AEDT — matches may briefly disconnect."
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Play-disabled message</Label>
            <Textarea
              value={s.play_disabled_message}
              onChange={(e) => setS((p) => ({ ...p, play_disabled_message: e.target.value }))}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <Label className="text-xs font-semibold">Reset a player's game progress</Label>
          <p className="text-[11px] text-muted-foreground">
            Wipes points, ELO, streaks, badges, and discovered Creator Types for the given user. Cannot be undone.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="player@example.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="destructive" onClick={resetPlayer} disabled={!resetEmail || resetting}>
              {resetting ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <Label className="text-xs font-semibold">Edit player points</Label>
          <p className="text-[11px] text-muted-foreground">
            Look up a player by email and update their points total directly.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="player@example.com"
              value={editEmail}
              onChange={(e) => { setEditEmail(e.target.value); setEditUserId(null); setEditPoints(""); }}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={lookupPlayer} disabled={!editEmail || editLoading}>
              {editLoading ? "Looking up…" : "Lookup"}
            </Button>
          </div>
          {editUserId && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="number"
                min={0}
                placeholder="Points"
                value={editPoints}
                onChange={(e) => setEditPoints(e.target.value)}
                className="h-8 text-sm w-32"
              />
              <Button size="sm" onClick={savePlayerPoints} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save points"}
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset to defaults</Button>
        <Button size="sm" onClick={save} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? "Saving…" : "Save settings"}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Note: Match Rules and bot toggles apply to newly created matches only. Active matches keep the rules they were started with.
      </p>
    </div>
  );
}

// ----- Deck Composition Section -----
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";

interface DeckRow {
  name: string;
  category: string;
  qty: number;
  color?: string;
}

function DeckCompositionSection() {
  const [animals, setAnimals] = useState<{ name: string; mythical: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("game_cards")
        .select("name, mythical")
        .order("sort_order", { ascending: true });
      setAnimals((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  // Category order matches the rulebook.
  const CATEGORY_ORDER = [
    "Creator Cards",
    "Sky Creator Cards",
    "Animal Cards",
    "Sky Creature Cards",
    "Golden Body Card",
    "Golden Hive Card",
  ] as const;

  const rows: DeckRow[] = [];
  // Creator Cards: 2 of each of the 12 element-mapped types (excluding Sky).
  for (const t of CREATOR_TYPE_NAMES) {
    if (t === "Sky") continue;
    rows.push({ name: `${t} Creator`, category: "Creator Cards", qty: 2, color: getCreatorTypeColor(t) });
  }
  // Sky Creator Cards
  rows.push({ name: "Sky Creator", category: "Sky Creator Cards", qty: 2, color: getCreatorTypeColor("Sky") });
  // Animals & Sky Creatures (one of each unique card)
  for (const a of animals) {
    rows.push({
      name: a.name,
      category: a.mythical ? "Sky Creature Cards" : "Animal Cards",
      qty: 1,
    });
  }
  // Golden specials
  rows.push({ name: "Golden Body", category: "Golden Body Card", qty: 8 });
  rows.push({ name: "Golden Hive", category: "Golden Hive Card", qty: 1 });

  // Sort rows by category order, then by name.
  rows.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category as any);
    const bi = CATEGORY_ORDER.indexOf(b.category as any);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  const total = rows.reduce((sum, r) => sum + r.qty, 0);
  const totals = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.qty;
    return acc;
  }, {});

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Library className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Deck Composition</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "Loading…" : `${total} cards total`}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {CATEGORY_ORDER.map((cat) => (
          <div
            key={cat}
            className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30"
          >
            <span className="text-xs font-medium">{cat}</span>
            <span className="text-sm font-semibold text-primary">×{totals[cat] ?? 0}</span>
          </div>
        ))}
      </div>




      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <a href="/card-preview" target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-1" />Preview card library
          </a>
        </Button>
        <Button variant="default" size="sm" onClick={() => setEditorOpen(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1" />Edit cards
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Deck includes Creator Cards, Sky Creator Cards, Animal Cards, Sky Creature Cards, Golden Body Cards and the Golden Hive Card.
        </p>
      </div>
      <CardEditorDialog open={editorOpen} onOpenChange={setEditorOpen} />
    </section>
  );
}


