import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { plainTextToRichHtml, RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/hooks/use-toast";
import { PROSPECTUS_IMAGE_SLOTS, type ProspectusSection } from "@/lib/prospectus";
import ProspectusPages from "@/components/prospectus/ProspectusPages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ImagePlus, Loader2, MonitorUp, Save, Trash2, X } from "lucide-react";

const PAGE_SECTIONS = [
  { page: 1, label: "Cover", keys: ["cover"] },
  { page: 2, label: "Why Creator Types", keys: ["why"] },
  { page: 3, label: "The journey", keys: ["journey"] },
  { page: 4, label: "Training levels", keys: ["training"] },
  { page: 5, label: "Questions & expertise", keys: ["qa", "expertise"] },
  { page: 6, label: "Contact & application", keys: ["contact", "eligibility", "application"] },
] as const;

/** Admin editor for the public /prospectus page. */
export default function ProspectusEditor() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProspectusSection[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [activePage, setActivePage] = useState(1);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("prospectus_sections" as any).select("id, sort_order, layout_key, heading, body, image_urls").order("sort_order");
    const loaded = (data as unknown as ProspectusSection[]) ?? [];
    setRows(loaded);
    const inlinePaths = loaded.flatMap((row) => Array.from(row.body.matchAll(/data-storage-path=["']([^"']+)["']/g), (match) => match[1]));
    const paths = [...new Set([...loaded.flatMap((row) => Object.values(row.image_urls ?? {})).filter(Boolean), ...inlinePaths])];
    const { data: signed } = await supabase.storage.from("prospectus-assets").createSignedUrls(paths, 3600);
    const signedByPath = Object.fromEntries((signed ?? []).map((item) => [item.path, item.signedUrl]));
    setPreviews(signedByPath);
    setRows(loaded.map((row) => ({ ...row, body: row.body.replace(/(<img\b[^>]*data-storage-path=["']([^"']+)["'][^>]*\bsrc=["'])[^"']*(["'])/gi, (_all, before, path, after) => `${before}${signedByPath[path] ?? ""}${after}`) })));
    if (!activeSectionId && loaded[0]) setActiveSectionId(loaded[0].id);
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

  const pageConfig = PAGE_SECTIONS.find((item) => item.page === activePage) ?? PAGE_SECTIONS[0];
  const pageRows = rows.filter((row) => pageConfig.keys.includes((row.layout_key ?? "") as never));
  const activeSection = pageRows.find((row) => row.id === activeSectionId) ?? pageRows[0];
  const imageUrls = useMemo(() => Object.fromEntries(rows.map((row) => [row.layout_key, Object.fromEntries(Object.entries(row.image_urls ?? {}).map(([key, path]) => [key, previews[path] ?? ""]))])), [rows, previews]);

  function choosePage(page: number) {
    setActivePage(page);
    const config = PAGE_SECTIONS.find((item) => item.page === page);
    const first = rows.find((row) => config?.keys.includes((row.layout_key ?? "") as never));
    setActiveSectionId(first?.id ?? null);
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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl">Practitioner Prospectus</h3>
        <a href="/prospectus" target="_blank" rel="noreferrer" className="text-sm text-primary underline">View page</a>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}><MonitorUp className="mr-2 h-4 w-4" />Open visual editor</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[94vh] w-[96vw] max-w-[96vw] overflow-hidden p-0">
          <DialogTitle className="sr-only">Practitioner Prospectus visual editor</DialogTitle>
          <div className="flex h-full min-h-0 flex-col bg-muted/30">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
              <div><p className="font-display text-lg leading-none">Prospectus editor</p><p className="mt-1 text-xs text-muted-foreground">Page {activePage} of 6 · {pageConfig.label}</p></div>
              <Button size="sm" variant="outline" className="ml-auto" asChild><a href="/prospectus" target="_blank" rel="noreferrer">Preview website</a></Button>
              {activeSection && <Button size="sm" disabled={saving === activeSection.id} onClick={() => save(activeSection)}><Save className="mr-2 h-4 w-4" />{saving === activeSection.id ? "Saving…" : "Save page"}</Button>}
              <Button size="icon" variant="ghost" aria-label="Close editor" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)_390px]">
              <nav className="overflow-y-auto border-r border-border bg-card p-2" aria-label="Prospectus pages">
                {PAGE_SECTIONS.map((item) => <Button key={item.page} variant={item.page === activePage ? "secondary" : "ghost"} className="mb-1 h-auto w-full justify-start px-3 py-2 text-left" onClick={() => choosePage(item.page)}><span className="mr-3 grid h-7 w-7 shrink-0 place-items-center rounded bg-background text-xs font-semibold">{item.page}</span><span className="whitespace-normal text-xs leading-tight">{item.label}</span></Button>)}
              </nav>

              <main className="min-w-0 overflow-auto p-4 lg:p-8">
                <div className="mx-auto max-w-[1000px]">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Live page preview</span><span>Landscape A4</span></div>
                  <div className="prospectus-editor-canvas overflow-hidden rounded-sm border border-border bg-background shadow-xl">
                    <ProspectusPages sections={rows} imageUrls={imageUrls} activePage={activePage} />
                  </div>
                </div>
              </main>

              <aside className="min-h-0 overflow-y-auto border-l border-border bg-card p-4">
                {pageRows.length > 1 && <div className="mb-4 flex flex-wrap gap-1">{pageRows.map((row) => <Button key={row.id} size="sm" variant={row.id === activeSection?.id ? "secondary" : "outline"} onClick={() => setActiveSectionId(row.id)}>{row.heading || row.layout_key}</Button>)}</div>}
                {activeSection ? <div className="space-y-4">
                  <label className="block text-xs font-medium">Heading<input className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={activeSection.heading} onChange={(e) => edit(activeSection.id, { heading: e.target.value })} /></label>
                  <div className="space-y-1"><p className="text-xs font-medium">Page content</p><RichTextEditor value={plainTextToRichHtml(activeSection.body)} onChange={(body) => edit(activeSection.id, { body })} placeholder="Write the page content…" minHeight={360} uploadBucket="prospectus-assets" allowImages /></div>
                  <p className="text-xs text-muted-foreground">Select text to align it. Select a picture to resize it or wrap text on its left or right.</p>
                  {(PROSPECTUS_IMAGE_SLOTS[activeSection.layout_key ?? "cover"] ?? []).map((slot) => {
                const path = activeSection.image_urls?.[slot.key];
                const marker = `${activeSection.id}:${slot.key}`;
                return <div key={slot.key} className="flex flex-wrap items-center gap-3 rounded-md bg-muted p-2">
                  {path && previews[path] ? <img src={previews[path]} alt="" className="h-16 w-24 rounded object-cover" /> : <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed"><ImagePlus className="h-5 w-5" /></div>}
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{slot.label}</p><p className="text-xs text-muted-foreground">JPG, PNG or WebP</p></div>
                   <Button size="sm" variant="outline" asChild><label className="cursor-pointer">{uploading === marker ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Replace<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading === marker} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadImage(activeSection, slot.key, file); }} /></label></Button>
                   {path && <Button size="icon" variant="ghost" aria-label={`Remove ${slot.label}`} onClick={() => removeImage(activeSection, slot.key)}><Trash2 className="h-4 w-4" /></Button>}
                </div>;
              })}
                </div> : <p className="text-sm text-muted-foreground">This page has no editable content.</p>}
              </aside>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
