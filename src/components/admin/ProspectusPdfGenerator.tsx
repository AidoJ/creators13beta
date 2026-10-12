import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import ProspectusPages from "@/components/prospectus/ProspectusPages";
import { useProspectusData } from "@/lib/useProspectusData";
import {
  assemblePdf, capturePage, prospectusContentHash, PROSPECTUS_META_PATH, PROSPECTUS_PDF_PATH, type ProspectusPdfMeta,
} from "@/lib/downloadProspectusPdf";
import { FileDown, Loader2, RotateCcw } from "lucide-react";

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtDate = (s: string) => new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" }) + " (Brisbane)";

/** Admin-only: builds the prospectus PDF once, from the desktop-size page layout, and stores it for members. */
export default function ProspectusPdfGenerator() {
  const [active, setActive] = useState(false);
  const { rows, imageUrls, canvases, signed } = useProspectusData(active);
  const [meta, setMeta] = useState<ProspectusPdfMeta | null | undefined>(undefined);
  const [currentHash, setCurrentHash] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const captured = useRef<string[]>([]);
  const timings = useRef<number[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const started = useRef(0);

  const loadMeta = useCallback(async () => {
    const { data } = await supabase.storage.from("prospectus-assets").download(`${PROSPECTUS_META_PATH}?t=${Date.now()}`);
    setMeta(data ? JSON.parse(await data.text()) : null);
    setCurrentHash(await prospectusContentHash());
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  async function waitForPages(): Promise<HTMLElement[]> {
    for (let i = 0; i < 120; i += 1) {
      const pages = Array.from(stage.current?.querySelectorAll<HTMLElement>("[data-prospectus-page]") ?? []);
      if (pages.length >= 6 || (rows && pages.length && i > 10)) {
        await document.fonts.ready;
        await Promise.all(pages.flatMap((p) => Array.from(p.querySelectorAll("img"))).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
        return pages;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("The prospectus pages didn't load.");
  }

  async function run(resume: boolean) {
    setRunning(true); setError(null);
    if (!resume) { captured.current = []; timings.current = []; started.current = performance.now(); setActive(true); }
    try {
      const hash = await prospectusContentHash();
      const pages = await waitForPages();
      for (let i = captured.current.length; i < pages.length; i += 1) {
        setStatus(`Page ${i + 1} of ${pages.length}`);
        const t = performance.now();
        captured.current[i] = await capturePage(pages[i], `Page ${i + 1}`);
        timings.current[i] = performance.now() - t;
      }
      setStatus("Saving the PDF…");
      const blob = assemblePdf(captured.current);
      const bucket = supabase.storage.from("prospectus-assets");
      const up = await bucket.upload(PROSPECTUS_PDF_PATH, blob, { upsert: true, contentType: "application/pdf", cacheControl: "60" });
      if (up.error) throw new Error(`Couldn't save the PDF: ${up.error.message}`);
      const next: ProspectusPdfMeta = {
        generated_at: new Date().toISOString(), size: blob.size, pages: pages.length, content_hash: hash,
        longest_page_ms: Math.round(Math.max(...timings.current.filter(Boolean), 0)), total_ms: Math.round(performance.now() - started.current),
      };
      await bucket.upload(PROSPECTUS_META_PATH, new Blob([JSON.stringify(next)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
      captured.current = []; setMeta(next); setCurrentHash(hash); setStatus(null); setActive(false);
    } catch (e) {
      setError(`${(e as Error).message}. The previous PDF is still in place.`);
      setStatus(null);
    } finally { setRunning(false); }
  }

  const stale = meta && currentHash && meta.content_hash !== currentHash;
  const done = captured.current.length;

  return <div className="rounded-lg border border-border p-4 space-y-3">
    <div>
      <h3 className="font-display text-lg">Prospectus PDF</h3>
      <p className="text-sm text-muted-foreground">Members download this stored file. Generate it again after you save changes in the page builder.</p>
    </div>
    {meta === undefined ? <p className="text-sm text-muted-foreground">Checking…</p>
      : meta ? <p className="text-sm">Last generated {fmtDate(meta.generated_at)} · {fmtSize(meta.size)} · {meta.pages} pages</p>
      : <p className="text-sm text-destructive">No PDF yet. Members see "The prospectus isn't ready yet".</p>}
    {stale && <p className="text-sm font-medium text-destructive">PDF out of date: regenerate</p>}
    {meta && !stale && currentHash && <p className="text-sm text-muted-foreground">Up to date with the latest saved edits.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="lg" onClick={() => run(false)} disabled={running}>{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}Generate PDF</Button>
      {error && done > 0 && <Button size="lg" variant="outline" onClick={() => run(true)} disabled={running}><RotateCcw className="mr-2 h-4 w-4" />Retry from page {done + 1}</Button>}
      {error && done === 0 && <Button size="lg" variant="outline" onClick={() => run(false)} disabled={running}><RotateCcw className="mr-2 h-4 w-4" />Retry</Button>}
    </div>
    {status && <p className="text-sm" role="status" aria-live="polite">{status}</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {active && rows && <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: 1123, pointerEvents: "none" }}>
      <div ref={stage} className="prospectus-seed"><ProspectusPages sections={rows} imageUrls={imageUrls} canvases={canvases} signed={signed} /></div>
    </div>}
  </div>;
}
