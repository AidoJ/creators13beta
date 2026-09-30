import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { PROSPECTUS_IMAGE_SLOTS, type ProspectusSection } from "@/lib/prospectus";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

/** Admin editor for the public /prospectus page. */
export default function ProspectusEditor() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProspectusSection[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from("prospectus_sections" as any).select("id, sort_order, layout_key, heading, body, image_urls").order("sort_order");
    const loaded = (data as unknown as ProspectusSection[]) ?? [];
    setRows(loaded);
    const paths = [...new Set(loaded.flatMap((row) => Object.values(row.image_urls ?? {})).filter(Boolean))];
    const { data: signed } = await supabase.storage.from("prospectus-assets").createSignedUrls(paths, 3600);
    setPreviews(Object.fromEntries((signed ?? []).map((item) => [item.path, item.signedUrl])));
  }
  useEffect(() => { if (open) load(); }, [open]);

  const edit = (id: string, patch: Partial<ProspectusSection>) =>
    setRows((r) => r.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function save(s: ProspectusSection) {
    setSaving(s.id);
    const { error } = await supabase.from("prospectus_sections" as any)
      .update({ heading: s.heading, body: s.body, sort_order: s.sort_order, image_urls: s.image_urls }).eq("id", s.id);
    setSaving(null);
    toast(error ? { title: "Couldn't save", description: error.message, variant: "destructive" } : { title: "Saved" });
  }
  async function uploadImage(row: ProspectusSection, slot: string, file: File) {
    const marker = `${row.id}:${slot}`;
    setUploading(marker);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${row.layout_key}/${slot}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("prospectus-assets").upload(path, file, { contentType: file.type, upsert: true });
    if (error) toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    else {
      const next = { ...(row.image_urls ?? {}), [slot]: path };
      const { error: saveError } = await supabase.from("prospectus_sections" as any).update({ image_urls: next }).eq("id", row.id);
      if (saveError) toast({ title: "Couldn't save picture", description: saveError.message, variant: "destructive" });
      else { toast({ title: "Picture updated" }); await load(); }
    }
    setUploading(null);
  }

  async function removeImage(row: ProspectusSection, slot: string) {
    const next = { ...(row.image_urls ?? {}) };
    delete next[slot];
    const { error } = await supabase.from("prospectus_sections" as any).update({ image_urls: next }).eq("id", row.id);
    if (error) toast({ title: "Couldn't remove picture", description: error.message, variant: "destructive" });
    else { toast({ title: "Picture removed" }); await load(); }
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
          <p className="text-xs text-muted-foreground">Edit the wording and pictures below. Leave a blank line between paragraphs; start list lines with “- ” or “1. ”.</p>
          {rows.map((s) => (
            <div key={s.id} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-xs font-semibold uppercase text-primary">{s.layout_key === "cover" ? "Page 1 · Cover" : `${s.layout_key === "why" ? "Page 2" : s.layout_key === "journey" ? "Page 3" : s.layout_key === "training" ? "Page 4" : s.layout_key === "qa" || s.layout_key === "expertise" ? "Page 5" : "Page 6"} · ${s.layout_key}`}</p>
              <label className="block text-xs font-medium">Heading<input className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={s.heading} onChange={(e) => edit(s.id, { heading: e.target.value })} /></label>
              <Textarea rows={8} value={s.body} aria-label="Text" onChange={(e) => edit(s.id, { body: e.target.value })} />
              {(PROSPECTUS_IMAGE_SLOTS[s.layout_key ?? "cover"] ?? []).map((slot) => {
                const path = s.image_urls?.[slot.key];
                const marker = `${s.id}:${slot.key}`;
                return <div key={slot.key} className="flex flex-wrap items-center gap-3 rounded-md bg-muted p-2">
                  {path && previews[path] ? <img src={previews[path]} alt="" className="h-16 w-24 rounded object-cover" /> : <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed"><ImagePlus className="h-5 w-5" /></div>}
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{slot.label}</p><p className="text-xs text-muted-foreground">JPG, PNG or WebP</p></div>
                  <Button size="sm" variant="outline" asChild><label className="cursor-pointer">{uploading === marker ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Replace<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading === marker} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadImage(s, slot.key, file); }} /></label></Button>
                  {path && <Button size="icon" variant="ghost" aria-label={`Remove ${slot.label}`} onClick={() => removeImage(s, slot.key)}><Trash2 className="h-4 w-4" /></Button>}
                </div>;
              })}
              <div className="flex gap-2">
                <Button size="sm" disabled={saving === s.id} onClick={() => save(s)}>{saving === s.id ? "Saving…" : "Save section"}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
