import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { ProspectusSection } from "@/lib/prospectus";

/** Admin editor for the public /prospectus page. */
export default function ProspectusEditor() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProspectusSection[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("prospectus_sections" as any).select("id, sort_order, heading, body").order("sort_order");
    setRows((data as unknown as ProspectusSection[]) ?? []);
  }
  useEffect(() => { if (open) load(); }, [open]);

  const edit = (id: string, patch: Partial<ProspectusSection>) =>
    setRows((r) => r.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function save(s: ProspectusSection) {
    setSaving(s.id);
    const { error } = await supabase.from("prospectus_sections" as any)
      .update({ heading: s.heading, body: s.body, sort_order: s.sort_order }).eq("id", s.id);
    setSaving(null);
    toast(error ? { title: "Couldn't save", description: error.message, variant: "destructive" } : { title: "Saved" });
  }
  async function add() {
    const next = (rows.at(-1)?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("prospectus_sections" as any).insert({ sort_order: next, heading: "New section", body: "" });
    if (!error) load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this section from the prospectus?")) return;
    await supabase.from("prospectus_sections" as any).delete().eq("id", id);
    load();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl">Practitioner Prospectus</h3>
        <a href="/prospectus" target="_blank" rel="noreferrer" className="text-sm text-primary underline">View page</a>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen((o) => !o)}>{open ? "Close editor" : "Edit prospectus"}</Button>
      </div>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Leave a blank line between paragraphs. Start a line with "- " for a bullet, or "1. " for a numbered list.
          </p>
          {rows.map((s) => (
            <div key={s.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <Input type="number" className="w-20" value={s.sort_order} aria-label="Order"
                  onChange={(e) => edit(s.id, { sort_order: Number(e.target.value) })} />
                <Input value={s.heading} aria-label="Heading" onChange={(e) => edit(s.id, { heading: e.target.value })} />
              </div>
              <Textarea rows={8} value={s.body} aria-label="Text" onChange={(e) => edit(s.id, { body: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving === s.id} onClick={() => save(s)}>{saving === s.id ? "Saving…" : "Save section"}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>Delete</Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={add}>Add section</Button>
        </div>
      )}
    </div>
  );
}
