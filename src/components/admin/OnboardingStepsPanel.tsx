import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import StaffGuide from "@/components/admin/StaffGuide";

type Step = { key: string; feature_key: string; title: string; description: string; cta_label: string; route: string; sort_order: number; enabled: boolean };
type Level = { key: string; display_name: string };

export default function OnboardingStepsPanel() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("onboarding_steps" as any).select("*").order("sort_order"),
      supabase.from("access_levels").select("key, display_name").order("sort_order"),
    ]).then(([s, l]) => { setSteps((s.data || []) as unknown as Step[]); setLevels((l.data || []) as Level[]); });
  }, []);

  useEffect(() => {
    if (selected.length === 0) { setPreview([]); return; }
    (supabase as any).rpc("preview_onboarding_for_levels", { _level_keys: selected }).then(({ data }: any) => setPreview(data || []));
  }, [selected]);

  const update = (key: string, patch: Partial<Step>) => setSteps((all) => all.map((step) => step.key === key ? { ...step, ...patch } : step));
  const save = async () => {
    setSaving(true);
    const payload = steps.map(({ key, title, description, cta_label, route, sort_order, enabled }) => ({ key, title, description, cta_label, route, sort_order, enabled }));
    const { error } = await supabase.from("onboarding_steps" as any).upsert(payload as any, { onConflict: "key" });
    setSaving(false);
    toast(error ? { title: "Couldn't save", description: error.message, variant: "destructive" } : { title: "Getting started guide saved" });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-xl">Getting started</h3><p className="text-sm text-muted-foreground">Edit wording and order. Access and completion rules stay protected.</p></div><Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />Save</Button></div>
      <div className="space-y-3">{steps.map((step) => <Card key={step.key} className="p-4 grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
        <div><Label>Title</Label><Input value={step.title} onChange={(e) => update(step.key, { title: e.target.value })} /></div>
        <div><Label>Description</Label><Input value={step.description} onChange={(e) => update(step.key, { description: e.target.value })} /></div>
        <div><Label>Order</Label><Input type="number" value={step.sort_order} onChange={(e) => update(step.key, { sort_order: Number(e.target.value) })} /></div>
        <div><Label>Button label</Label><Input value={step.cta_label} onChange={(e) => update(step.key, { cta_label: e.target.value })} /></div>
        <div><Label>Destination</Label><Input value={step.route} onChange={(e) => update(step.key, { route: e.target.value })} /></div>
        <div className="flex items-end gap-2 pb-2"><Switch checked={step.enabled} onCheckedChange={(v) => update(step.key, { enabled: v })} /><span className="text-sm">On</span></div>
        <p className="sm:col-span-3 text-xs text-muted-foreground">Feature: {step.feature_key}</p>
      </Card>)}</div>
      <Card className="p-5 space-y-4"><div><h4 className="font-display text-lg">Preview by access</h4><p className="text-sm text-muted-foreground">Choose any combination. This preview never reads a real member's progress.</p></div><div className="flex flex-wrap gap-4">{levels.map((level) => <label key={level.key} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(level.key)} onCheckedChange={(on) => setSelected(on ? [...selected, level.key] : selected.filter((key) => key !== level.key))} />{level.display_name}</label>)}</div><div className="border-t border-border pt-3 space-y-2">{preview.length ? preview.map((step, i) => <p key={step.key} className="text-sm"><span className="text-muted-foreground mr-2">{i + 1}.</span>{step.title}</p>) : <p className="text-sm text-muted-foreground">Choose access levels to preview the merged guide.</p>}</div></Card>
      <StaffGuide audience="admin" editable />
    </div>
  );
}