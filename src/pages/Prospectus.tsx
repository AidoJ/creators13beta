import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ApplyDialog from "@/components/frontpage/ApplyDialog";
import type { ProspectusSection } from "@/lib/prospectus";
import ProspectusPages from "@/components/prospectus/ProspectusPages";
import { downloadProspectusPdf } from "@/lib/downloadProspectusPdf";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export default function Prospectus() {
  const [sections, setSections] = useState<ProspectusSection[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, Record<string, string>>>({});
  const [downloading, setDownloading] = useState(false);
  const [params] = useSearchParams();
  const [apply, setApply] = useState<1 | null>(params.get("apply") === "1" ? 1 : null);

  useEffect(() => {
    window.scrollTo(0, 0);
    supabase.from("prospectus_sections" as any).select("id, sort_order, layout_key, heading, body, image_urls")
      .order("sort_order").then(async ({ data }) => {
        const loaded = (data as unknown as ProspectusSection[]) ?? [];
        setSections(loaded);
        const inlinePaths = loaded.flatMap((section) => Array.from(section.body.matchAll(/data-storage-path=["']([^"']+)["']/g), (match) => match[1]));
        const paths = [...new Set([...loaded.flatMap((section) => Object.values(section.image_urls ?? {})).filter(Boolean), ...inlinePaths])];
        const { data: signed } = await supabase.storage.from("prospectus-assets").createSignedUrls(paths, 3600);
        const signedByPath = Object.fromEntries((signed ?? []).map((item) => [item.path, item.signedUrl]));
        setSections(loaded.map((section) => ({ ...section, body: section.body.replace(/(<img\b[^>]*data-storage-path=["']([^"']+)["'][^>]*\bsrc=["'])[^"']*(["'])/gi, (_all, before, path, after) => `${before}${signedByPath[path] ?? ""}${after}`) })));
        setImageUrls(Object.fromEntries(loaded.map((section) => [section.layout_key, Object.fromEntries(Object.entries(section.image_urls ?? {}).map(([key, path]) => [key, signedByPath[path] ?? ""]))])));
      });
  }, []);

  async function download() {
    setDownloading(true);
    try { await downloadProspectusPdf(); } finally { setDownloading(false); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground prospectus-shell">
      <div className="prospectus-toolbar print:hidden">
        <Link to="/#practitioner" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={download} disabled={downloading || !sections?.length}>{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download prospectus</Button>
          <Button onClick={() => setApply(1)}>Apply for Level 1</Button>
        </div>
      </div>
      {sections === null ? <p className="p-10 text-center text-muted-foreground">Loading…</p> : <ProspectusPages sections={sections} imageUrls={imageUrls} />}
      <div className="prospectus-actions print:hidden"><p>Ready to apply? Answer the four application questions.</p><Button onClick={() => setApply(1)}>Apply for Level 1</Button></div>
      <ApplyDialog level={apply} onClose={() => setApply(null)} />
    </div>
  );
}
