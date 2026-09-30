import { useEffect, useState } from "react";
import { BookOpen, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type GuideStep = { id: string; title: string; body: string; route: string; audience: string[]; sort_order: number; enabled: boolean };

export default function StaffGuide({ editable = false, audience }: { editable?: boolean; audience: "admin" | "trainer" }) {
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("staff_guide_steps" as any).select("*").contains("audience", [audience]).eq("enabled", true).order("sort_order").then(({ data }) => setSteps((data ?? []) as unknown as GuideStep[]));
  }, [audience]);

  const update = (id: string, patch: Partial<GuideStep>) => setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("staff_guide_steps" as any).upsert(steps as any);
    setSaving(false);
    toast(error ? { title: "Couldn't save", description: error.message, variant: "destructive" } : { title: "Staff guide saved" });
  };

  return <div className="space-y-4">
    <div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-primary" /><div className="flex-1"><h3 className="font-display text-xl">Staff guide</h3><p className="text-sm text-muted-foreground">Quick paths for the work available to this staff role.</p></div>{editable && <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />Save</Button>}</div>
    <div className="space-y-3">{steps.map((step, index) => <Card key={step.id} className="p-4">
      {editable ? <div className="grid gap-3 sm:grid-cols-2"><Input value={step.title} onChange={(e) => update(step.id, { title: e.target.value })} /><Input value={step.route} onChange={(e) => update(step.id, { route: e.target.value })} /><Textarea className="sm:col-span-2" value={step.body} onChange={(e) => update(step.id, { body: e.target.value })} /></div> : <a href={step.route} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span><span><span className="block font-semibold">{step.title}</span><span className="mt-1 block text-sm text-muted-foreground">{step.body}</span></span></a>}
    </Card>)}</div>
  </div>;
}