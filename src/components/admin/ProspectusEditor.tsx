import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ProspectusPages from "@/components/prospectus/ProspectusPages";
import { canvasBackground, ElementContent, elementStyle } from "@/components/prospectus/CanvasPage";
import { useProspectusData } from "@/lib/useProspectusData";
import {
  CANVAS_H, CANVAS_W, newId, PAGE_PRIMARY_KEYS, sanitizeCanvasHtml, seedFromPage, signInlineHtml, stripInlineHtml,
  type CanvasElement, type CanvasLayout,
} from "@/lib/prospectusCanvas";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Copy, ImagePlus, Italic, List, ListOrdered,
  Loader2, MonitorUp, Redo2, RotateCcw, Save, Square, Trash2, Type, Underline, Undo2, X,
} from "lucide-react";

const PAGE_LABELS = ["Cover", "Why Creator Types", "The journey", "Training levels", "Questions & expertise", "Contact & application"];
const FONTS = [{ label: "Questrial", value: "Questrial, sans-serif" }, { label: "Lilita One", value: "'Lilita One', sans-serif" }];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

type History = { past: CanvasLayout[]; future: CanvasLayout[] };

async function uploadAsset(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or WEBP).");
  if (file.size > 10 * 1024 * 1024) throw new Error("Pictures must be under 10 MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `canvas/${Date.now()}-${newId()}.${ext}`;
  const { error } = await supabase.storage.from("prospectus-assets").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** Editable text box: content is set imperatively so typing isn't reset by re-renders. */
const TextBox = memo(function TextBox({ el, editing, signed, register, onCommit, onInlineImage }: {
  el: CanvasElement; editing: boolean; signed: Record<string, string>;
  register: (id: string, node: HTMLDivElement | null) => void;
  onCommit: (id: string, html: string) => void;
  onInlineImage: (img: HTMLImageElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.innerHTML = sanitizeCanvasHtml(signInlineHtml(el.html ?? "", signed));
  }, [el.html, signed]);
  useEffect(() => { register(el.id, ref.current); return () => register(el.id, null); }, [el.id, register]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  return <div
    ref={ref}
    className="prospectus-canvas-text"
    contentEditable={editing}
    suppressContentEditableWarning
    style={{ cursor: editing ? "text" : "inherit" }}
    onBlur={() => ref.current && onCommit(el.id, ref.current.innerHTML)}
    onClick={(e) => onInlineImage(editing && e.target instanceof HTMLImageElement ? e.target : null)}
  />;
});

export default function ProspectusEditor() {
  const [open, setOpen] = useState(false);
  const { rows, signed, sign, reload, imageUrls } = useProspectusData(open);
  const [page, setPage] = useState(1);
  const [layouts, setLayouts] = useState<Record<number, CanvasLayout>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<Record<number, History>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [inlineImg, setInlineImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scale, setScale] = useState(0.8);
  const [seedPage, setSeedPage] = useState<number | null>(null);
  const stageWrap = useRef<HTMLDivElement>(null);
  const seedRef = useRef<HTMLDivElement>(null);
  const textNodes = useRef<Record<string, HTMLDivElement | null>>({});
  const register = useCallback((id: string, node: HTMLDivElement | null) => { textNodes.current[id] = node; }, []);

  const layout = layouts[page];
  const sel = layout?.elements.find((e) => e.id === selected) ?? null;

  // Load saved canvases once rows arrive.
  useEffect(() => {
    if (!rows) return;
    const saved: Record<number, CanvasLayout> = {};
    PAGE_PRIMARY_KEYS.forEach((key, i) => {
      const row = rows.find((r) => r.layout_key === key);
      if (row?.canvas_layout?.elements?.length) saved[i + 1] = row.canvas_layout;
    });
    setLayouts((prev) => ({ ...saved, ...Object.fromEntries(Object.entries(prev).filter(([p]) => dirty.has(Number(p)))) }));
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pages without a saved canvas start as a conversion of the current design.
  // Never seed a page that already has a saved canvas (avoids a race with the load effect above).
  useEffect(() => {
    if (!open || !rows || layouts[page] || seedPage !== null) return;
    const row = rows.find((r) => r.layout_key === PAGE_PRIMARY_KEYS[page - 1]);
    if (row?.canvas_layout?.elements?.length) return;
    setSeedPage(page);
  }, [open, rows, page, layouts, seedPage]);
  useEffect(() => {
    if (seedPage === null) return;
    let cancelled = false;
    const run = async () => {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 150));
      const node = seedRef.current?.querySelector<HTMLElement>("[data-prospectus-page]");
      if (!node) return;
      await Promise.all(Array.from(node.querySelectorAll("img")).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
      if (cancelled) return;
      const urlToPath = Object.fromEntries(Object.entries(signed).map(([p, u]) => [u, p]));
      const seeded = seedFromPage(node, urlToPath);
      setLayouts((prev) => (prev[seedPage] ? prev : { ...prev, [seedPage]: seeded }));
      setSeedPage(null);
    };
    run();
    return () => { cancelled = true; };
  }, [seedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the page to the available stage width.
  useEffect(() => {
    if (!open || !stageWrap.current) return;
    const node = stageWrap.current;
    const observer = new ResizeObserver(() => setScale(Math.min((node.clientWidth - 48) / CANVAS_W, (node.clientHeight - 48) / CANVAS_H)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, layout]);

  const commit = useCallback((next: CanvasLayout, pushHistory = true) => {
    setLayouts((prev) => {
      const current = prev[page];
      if (pushHistory && current) setHistory((h) => ({ ...h, [page]: { past: [...(h[page]?.past ?? []).slice(-49), current], future: [] } }));
      return { ...prev, [page]: next };
    });
    setDirty((d) => new Set(d).add(page));
  }, [page]);

  const updateEl = useCallback((id: string, patch: Partial<CanvasElement>) => {
    setLayouts((prev) => {
      const current = prev[page];
      if (!current) return prev;
      setHistory((h) => ({ ...h, [page]: { past: [...(h[page]?.past ?? []).slice(-49), current], future: [] } }));
      return { ...prev, [page]: { ...current, elements: current.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) } };
    });
    setDirty((d) => new Set(d).add(page));
  }, [page]);

  const commitText = useCallback((id: string, html: string) => {
    const current = layouts[page]?.elements.find((e) => e.id === id);
    const clean = sanitizeCanvasHtml(html);
    if (current && current.html !== clean) updateEl(id, { html: clean });
  }, [layouts, page, updateEl]);

  function undo() {
    const h = history[page];
    if (!h?.past.length || !layout) return;
    setHistory({ ...history, [page]: { past: h.past.slice(0, -1), future: [layout, ...h.future] } });
    setLayouts({ ...layouts, [page]: h.past[h.past.length - 1] });
    setDirty((d) => new Set(d).add(page));
  }
  function redo() {
    const h = history[page];
    if (!h?.future.length || !layout) return;
    setHistory({ ...history, [page]: { past: [...h.past, layout], future: h.future.slice(1) } });
    setLayouts({ ...layouts, [page]: h.future[0] });
    setDirty((d) => new Set(d).add(page));
  }

  const topZ = () => Math.max(0, ...(layout?.elements.map((e) => e.z) ?? [0])) + 1;
  function add(el: Omit<CanvasElement, "id" | "z">) {
    if (!layout) return;
    const created = { ...el, id: newId(), z: topZ() } as CanvasElement;
    commit({ ...layout, elements: [...layout.elements, created] });
    setSelected(created.id);
    return created;
  }
  function addText() {
    const el = add({ type: "text", x: 380, y: 320, w: 360, h: 120, html: `<p style="font-size:20px;font-family:Questrial, sans-serif">Double-click to type</p>` });
    if (el) setEditing(el.id);
  }
  async function addImage() {
    const file = await pickFile();
    if (!file) return;
    setBusy("image");
    try {
      const path = await uploadAsset(file);
      await sign([path]);
      add({ type: "image", x: 360, y: 220, w: 400, h: 300, path, fit: "cover" });
      toast({ title: "Picture added", description: "Drag it into place and pull the corners to resize." });
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    setBusy(null);
  }
  async function replaceImage() {
    if (!sel) return;
    const file = await pickFile();
    if (!file) return;
    setBusy("image");
    try { const path = await uploadAsset(file); await sign([path]); updateEl(sel.id, { path }); }
    catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    setBusy(null);
  }
  async function setPageBackgroundImage() {
    if (!layout) return;
    const file = await pickFile();
    if (!file) return;
    setBusy("image");
    try { const path = await uploadAsset(file); await sign([path]); commit({ ...layout, bgPath: path }); }
    catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    setBusy(null);
  }
  function remove() {
    if (!layout || !sel) return;
    commit({ ...layout, elements: layout.elements.filter((e) => e.id !== sel.id) });
    setSelected(null); setEditing(null);
  }
  function duplicate() {
    if (!sel) return;
    const { id: _id, z: _z, ...rest } = sel;
    add({ ...rest, x: sel.x + 20, y: sel.y + 20 });
  }
  function layer(dir: 1 | -1) {
    if (!layout || !sel) return;
    const sorted = [...layout.elements].sort((a, b) => a.z - b.z);
    const index = sorted.findIndex((e) => e.id === sel.id);
    const swap = sorted[index + dir];
    if (!swap) return;
    commit({ ...layout, elements: layout.elements.map((e) => e.id === sel.id ? { ...e, z: swap.z } : e.id === swap.id ? { ...e, z: sel.z } : e) });
  }

  // Rich text commands apply to the selection, or the whole box when not typing.
  function format(command: string, value?: string) {
    if (!sel || sel.type !== "text") return;
    const node = textNodes.current[sel.id];
    if (!node) return;
    if (editing !== sel.id || !node.contains(window.getSelection()?.anchorNode ?? null)) {
      node.contentEditable = "true";
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range);
    }
    document.execCommand("styleWithCSS", false, "true");
    if (command === "fontSizePx") {
      document.execCommand("fontSize", false, "7");
      node.querySelectorAll('font[size="7"]').forEach((f) => { const span = document.createElement("span"); span.style.fontSize = `${value}px`; span.innerHTML = f.innerHTML; f.replaceWith(span); });
      node.querySelectorAll<HTMLElement>('[style*="xxx-large"]').forEach((n) => { n.style.fontSize = `${value}px`; });
    } else document.execCommand(command, false, value);
    if (editing !== sel.id) node.contentEditable = "false";
    updateEl(sel.id, { html: sanitizeCanvasHtml(node.innerHTML) });
  }
  async function insertInlineImage(float: "left" | "right") {
    if (!sel || sel.type !== "text") return;
    const node = textNodes.current[sel.id];
    const saved = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
    const file = await pickFile();
    if (!file || !node) return;
    setBusy("image");
    try {
      const path = await uploadAsset(file);
      const map = await sign([path]);
      const margin = float === "left" ? "0 14px 8px 0" : "0 0 8px 14px";
      const html = `<img data-storage-path="${path}" src="${map[path] ?? ""}" crossorigin="anonymous" alt="" style="float:${float};width:40%;margin:${margin};border-radius:6px">`;
      setEditing(sel.id);
      node.contentEditable = "true";
      node.focus();
      const s = window.getSelection();
      if (saved && node.contains(saved.startContainer)) { s?.removeAllRanges(); s?.addRange(saved); }
      else { const r = document.createRange(); r.selectNodeContents(node); r.collapse(true); s?.removeAllRanges(); s?.addRange(r); }
      document.execCommand("insertHTML", false, html);
      updateEl(sel.id, { html: sanitizeCanvasHtml(node.innerHTML) });
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    setBusy(null);
  }
  function styleInlineImage(patch: Partial<CSSStyleDeclaration>) {
    if (!inlineImg || !sel) return;
    Object.assign(inlineImg.style, patch);
    if (patch.float === "left") inlineImg.style.margin = "0 14px 8px 0";
    if (patch.float === "right") inlineImg.style.margin = "0 0 8px 14px";
    if (patch.float === "none") inlineImg.style.margin = "8px auto";
    const node = textNodes.current[sel.id];
    if (node) updateEl(sel.id, { html: sanitizeCanvasHtml(node.innerHTML) });
  }

  async function saveAll() {
    setBusy("save");
    let failed = false;
    for (const p of dirty) {
      const key = PAGE_PRIMARY_KEYS[p - 1];
      const row = rows?.find((r) => r.layout_key === key);
      const l = layouts[p];
      if (!row || !l) continue;
      const clean: CanvasLayout = { ...l, elements: l.elements.map((e) => (e.html ? { ...e, html: stripInlineHtml(e.html) } : e)) };
      const { error } = await supabase.from("prospectus_sections" as any).update({ canvas_layout: clean as any }).eq("id", row.id);
      if (error) { failed = true; toast({ title: `Couldn't save ${PAGE_LABELS[p - 1]}`, description: error.message, variant: "destructive" }); }
    }
    if (!failed) { setDirty(new Set()); toast({ title: "Prospectus saved", description: "The public page and PDF now show your changes." }); }
    setBusy(null);
  }
  async function resetPage() {
    if (!confirm("Reset this page to the original prospectus design? Your changes to this page will be lost.")) return;
    const row = rows?.find((r) => r.layout_key === PAGE_PRIMARY_KEYS[page - 1]);
    if (row) await supabase.from("prospectus_sections" as any).update({ canvas_layout: null }).eq("id", row.id);
    setLayouts((prev) => { const next = { ...prev }; delete next[page]; return next; });
    setDirty((d) => { const n = new Set(d); n.delete(page); return n; });
    setSelected(null); setEditing(null);
    await reload();
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = editing || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveAll(); return; }
      if (e.key === "Escape") { if (editing) { setEditing(null); } else setSelected(null); return; }
      if (typing || !sel) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) { e.preventDefault(); updateEl(sel.id, { x: sel.x + moves[e.key][0], y: sel.y + moves[e.key][1] }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    if (dirty.size && !confirm("You have unsaved changes. Close without saving?")) return;
    setOpen(false); setDirty(new Set()); setLayouts({}); setHistory({}); setSelected(null); setEditing(null);
  }

  const fmtBtn = (icon: React.ReactNode, label: string, run: () => void) =>
    <Button key={label} type="button" size="icon" variant="outline" className="h-8 w-8" title={label} aria-label={label} onMouseDown={(e) => { e.preventDefault(); run(); }}>{icon}</Button>;

  return <>
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div>
        <h3 className="font-display text-lg">Practitioner prospectus</h3>
        <p className="text-sm text-muted-foreground">Design the six prospectus pages with drag-and-drop. Move and resize text, pictures and colour panels, wrap text around pictures, then save. The public page and PDF match what you build.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setOpen(true)}><MonitorUp className="mr-2 h-4 w-4" />Open page builder</Button>
        <Button variant="outline" asChild><a href="/prospectus" target="_blank" rel="noreferrer">View public page</a></Button>
      </div>
    </div>

    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-none w-screen h-[100dvh] p-0 gap-0 rounded-none flex flex-col [&>button]:hidden">
        <DialogTitle className="sr-only">Prospectus page builder</DialogTitle>
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <strong className="mr-2">Page builder</strong>
          <Button size="sm" variant="outline" onClick={addText} disabled={!layout}><Type className="mr-1 h-4 w-4" />Text</Button>
          <Button size="sm" variant="outline" onClick={addImage} disabled={!layout || busy === "image"}>{busy === "image" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Picture</Button>
          <Button size="sm" variant="outline" onClick={() => add({ type: "box", x: 400, y: 300, w: 300, h: 200, bg: "#E9D694", radius: 12 })} disabled={!layout}><Square className="mr-1 h-4 w-4" />Colour panel</Button>
          <span className="mx-1 h-6 w-px bg-border" />
          {fmtBtn(<Undo2 className="h-4 w-4" />, "Undo", undo)}
          {fmtBtn(<Redo2 className="h-4 w-4" />, "Redo", redo)}
          <span className="mx-1 h-6 w-px bg-border" />
          <label className="flex items-center gap-1 text-xs">Page colour<input type="color" className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" value={toHex(layout?.bg)} onChange={(e) => layout && commit({ ...layout, bg: e.target.value })} disabled={!layout} /></label>
          <Button size="sm" variant="outline" onClick={setPageBackgroundImage} disabled={!layout}>Background picture</Button>
          {layout?.bgPath && <Button size="sm" variant="ghost" onClick={() => commit({ ...layout, bgPath: undefined })}>Remove background</Button>}
          <Button size="sm" variant="ghost" onClick={resetPage}><RotateCcw className="mr-1 h-4 w-4" />Reset page</Button>
          <div className="ml-auto flex items-center gap-2">
            {dirty.size > 0 && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <Button size="sm" onClick={saveAll} disabled={!dirty.size || busy === "save"}>{busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save</Button>
            <Button size="icon" variant="ghost" onClick={close} aria-label="Close builder"><X className="h-5 w-5" /></Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Pages */}
          <nav className="w-44 shrink-0 border-r border-border overflow-y-auto p-2 space-y-1">
            {PAGE_LABELS.map((label, i) => <button key={label} onClick={() => { setPage(i + 1); setSelected(null); setEditing(null); }} className={`w-full rounded-md px-3 py-2 text-left text-sm ${page === i + 1 ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              <span className="block text-xs opacity-70">Page {i + 1}{dirty.has(i + 1) ? " •" : ""}</span>{label}
            </button>)}
          </nav>

          {/* Stage */}
          <div ref={stageWrap} className="relative flex-1 min-w-0 overflow-auto bg-muted/40 flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setEditing(null); } }}>
            {!layout ? <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Preparing page…</p> :
              <div style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }} className="relative shrink-0 shadow-xl">
                <div className="absolute left-0 top-0 overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "0 0", ...canvasBackground(layout, signed) }}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setEditing(null); } }}>
                  {[...layout.elements].sort((a, b) => a.z - b.z).map((el) => {
                    const isSel = el.id === selected;
                    return <Rnd key={el.id} scale={scale} bounds="parent" size={{ width: el.w, height: el.h }} position={{ x: el.x, y: el.y }}
                      style={{ zIndex: el.z, outline: isSel ? "2px solid hsl(var(--primary))" : undefined, outlineOffset: 1 }}
                      className={isSel ? "" : "hover:outline hover:outline-1 hover:outline-primary/60"}
                      disableDragging={editing === el.id}
                      enableResizing={isSel && editing !== el.id}
                      lockAspectRatio={el.type === "image" && el.fit === "contain"}
                      resizeHandleClasses={isSel ? Object.fromEntries(["topRight", "bottomRight", "bottomLeft", "topLeft"].map((k) => [k, "prospectus-handle"])) : undefined}
                      onMouseDown={() => { if (selected !== el.id) { setSelected(el.id); setEditing(null); setInlineImg(null); } }}
                      onDoubleClick={() => el.type === "text" && setEditing(el.id)}
                      onDragStop={(_e, d) => { if (d.x !== el.x || d.y !== el.y) updateEl(el.id, { x: Math.round(d.x), y: Math.round(d.y) }); }}
                      onResizeStop={(_e, _dir, ref, _delta, pos) => updateEl(el.id, { w: Math.round(ref.offsetWidth), h: Math.round(ref.offsetHeight), x: Math.round(pos.x), y: Math.round(pos.y) })}>
                      <div className="h-full w-full overflow-hidden" style={elementStyle(el)}>
                        {el.type === "text"
                          ? <TextBox el={el} editing={editing === el.id} signed={signed} register={register} onCommit={commitText} onInlineImage={setInlineImg} />
                          : <ElementContent el={el} signed={signed} />}
                      </div>
                    </Rnd>;
                  })}
                </div>
              </div>}
          </div>

          {/* Properties */}
          <aside className="w-72 shrink-0 border-l border-border overflow-y-auto p-3 space-y-4 text-sm">
            {!sel ? <div className="space-y-2 text-muted-foreground">
              <p className="font-medium text-foreground">How to use</p>
              <p>Click anything on the page to select it. Drag to move it, and pull the corner handles to resize it.</p>
              <p>Double-click text to type. Use the text tools here to change size, colour and alignment.</p>
              <p>To wrap text around a picture, select a text box and choose “Picture in text”.</p>
              <p>Arrow keys nudge a selected item. Delete removes it. Ctrl/Cmd+Z undoes.</p>
            </div> : <>
              <div className="flex items-center justify-between"><p className="font-medium capitalize">{sel.type === "box" ? "Colour panel" : sel.type === "image" ? "Picture" : "Text box"}</p>
                <div className="flex gap-1">{fmtBtn(<Copy className="h-4 w-4" />, "Duplicate", duplicate)}{fmtBtn(<ArrowUp className="h-4 w-4" />, "Bring forward", () => layer(1))}{fmtBtn(<ArrowDown className="h-4 w-4" />, "Send backward", () => layer(-1))}{fmtBtn(<Trash2 className="h-4 w-4" />, "Delete", remove)}</div>
              </div>

              {sel.type === "text" && <div className="space-y-2">
                <Button size="sm" variant={editing === sel.id ? "default" : "outline"} className="w-full" onClick={() => setEditing(editing === sel.id ? null : sel.id)}>{editing === sel.id ? "Done typing" : "Edit text"}</Button>
                <div className="flex flex-wrap gap-1">
                  {fmtBtn(<Bold className="h-4 w-4" />, "Bold", () => format("bold"))}
                  {fmtBtn(<Italic className="h-4 w-4" />, "Italic", () => format("italic"))}
                  {fmtBtn(<Underline className="h-4 w-4" />, "Underline", () => format("underline"))}
                  {fmtBtn(<List className="h-4 w-4" />, "Bullets", () => format("insertUnorderedList"))}
                  {fmtBtn(<ListOrdered className="h-4 w-4" />, "Numbered list", () => format("insertOrderedList"))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {fmtBtn(<AlignLeft className="h-4 w-4" />, "Align left", () => format("justifyLeft"))}
                  {fmtBtn(<AlignCenter className="h-4 w-4" />, "Align centre", () => format("justifyCenter"))}
                  {fmtBtn(<AlignRight className="h-4 w-4" />, "Align right", () => format("justifyRight"))}
                  {fmtBtn(<AlignJustify className="h-4 w-4" />, "Justify", () => format("justifyFull"))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className="text-xs text-muted-foreground">Size</span>
                    <select className="w-full rounded-md border border-border bg-background px-2 py-1" defaultValue="" onChange={(e) => { if (e.target.value) format("fontSizePx", e.target.value); e.target.value = ""; }}>
                      <option value="" disabled>Choose</option>{SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                    </select></label>
                  <label className="space-y-1"><span className="text-xs text-muted-foreground">Font</span>
                    <select className="w-full rounded-md border border-border bg-background px-2 py-1" defaultValue="" onChange={(e) => { if (e.target.value) format("fontName", e.target.value); e.target.value = ""; }}>
                      <option value="" disabled>Choose</option>{FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                    </select></label>
                </div>
                <label className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Text colour</span><input type="color" className="h-8 w-12 rounded border border-border bg-transparent" onChange={(e) => format("foreColor", e.target.value)} /></label>
                <div className="space-y-1"><span className="text-xs text-muted-foreground">Picture in text (text wraps around it)</span>
                  <div className="grid grid-cols-2 gap-1">
                    <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => insertInlineImage("left")} disabled={busy === "image"}>Picture left</Button>
                    <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => insertInlineImage("right")} disabled={busy === "image"}>Picture right</Button>
                  </div>
                </div>
                {inlineImg && <div className="space-y-2 rounded-md border border-border p-2">
                  <p className="text-xs font-medium">Picture inside text</p>
                  <div className="grid grid-cols-3 gap-1">
                    <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => styleInlineImage({ float: "left" })}>Left</Button>
                    <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => styleInlineImage({ float: "none", display: "block" })}>Centre</Button>
                    <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => styleInlineImage({ float: "right" })}>Right</Button>
                  </div>
                  <label className="block text-xs text-muted-foreground">Width {parseInt(inlineImg.style.width) || 40}%
                    <input type="range" min={10} max={100} defaultValue={parseInt(inlineImg.style.width) || 40} className="w-full" onChange={(e) => styleInlineImage({ width: `${e.target.value}%` })} /></label>
                  <Button size="sm" variant="ghost" className="w-full" onMouseDown={(e) => e.preventDefault()} onClick={() => { inlineImg.remove(); const n = textNodes.current[sel.id]; if (n) updateEl(sel.id, { html: sanitizeCanvasHtml(n.innerHTML) }); setInlineImg(null); }}>Remove picture</Button>
                </div>}
              </div>}

              {sel.type === "image" && <div className="space-y-2">
                <Button size="sm" variant="outline" className="w-full" onClick={replaceImage} disabled={busy === "image"}>{busy === "image" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Replace picture</Button>
                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" variant={sel.fit !== "contain" ? "default" : "outline"} onClick={() => updateEl(sel.id, { fit: "cover" })}>Fill frame</Button>
                  <Button size="sm" variant={sel.fit === "contain" ? "default" : "outline"} onClick={() => updateEl(sel.id, { fit: "contain" })}>Show whole</Button>
                </div>
              </div>}

              {sel.type !== "image" && <label className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Background</span>
                <span className="flex items-center gap-1"><input type="color" className="h-8 w-12 rounded border border-border bg-transparent" value={toHex(sel.bg)} onChange={(e) => updateEl(sel.id, { bg: e.target.value })} />
                  {sel.bg && <Button size="sm" variant="ghost" onClick={() => updateEl(sel.id, { bg: undefined })}>None</Button>}</span></label>}

              <Slider label="Rounded corners" value={sel.radius ?? 0} max={80} onChange={(v) => updateEl(sel.id, { radius: v })} />
              {sel.type === "text" && <Slider label="Inner spacing" value={sel.padding ?? 0} max={60} onChange={(v) => updateEl(sel.id, { padding: v })} />}
              <Slider label="Opacity" value={Math.round((sel.opacity ?? 1) * 100)} max={100} onChange={(v) => updateEl(sel.id, { opacity: v / 100 })} />

              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "w", "h"] as const).map((k) => <label key={k} className="space-y-1"><span className="text-xs text-muted-foreground">{{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]}</span>
                  <Input type="number" value={sel[k]} onChange={(e) => updateEl(sel.id, { [k]: Number(e.target.value) || 0 })} /></label>)}
              </div>
            </>}
          </aside>
        </div>

        {/* Hidden render used to convert the original design into editable pieces */}
        {seedPage !== null && rows && <div ref={seedRef} aria-hidden className="prospectus-seed" style={{ position: "fixed", left: -20000, top: 0, width: CANVAS_W, pointerEvents: "none" }}>
          <ProspectusPages sections={rows} imageUrls={imageUrls} activePage={seedPage} />
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return <label className="block space-y-1"><span className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{value}</span></span>
    <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" /></label>;
}

function toHex(color?: string): string {
  if (!color) return "#ffffff";
  if (color.startsWith("#")) return color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join("")}` : color.slice(0, 7);
  const m = (color.match(/rgba?\([^)]*\)/)?.[0] ?? "").match(/\d+(\.\d+)?/g);
  if (!m) return "#ffffff";
  return `#${m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
}
