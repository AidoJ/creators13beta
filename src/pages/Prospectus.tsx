import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ApplyDialog from "@/components/frontpage/ApplyDialog";
import ProspectusPages from "@/components/prospectus/ProspectusPages";
import { downloadProspectusPdf } from "@/lib/downloadProspectusPdf";
import { useProspectusData } from "@/lib/useProspectusData";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Prospectus() {
  const { rows, imageUrls, canvases, signed } = useProspectusData();
  const [downloading, setDownloading] = useState(false);
  const [params] = useSearchParams();
  const [apply, setApply] = useState<1 | null>(params.get("apply") === "1" ? 1 : null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  async function download() {
    setDownloading(true);
    try { await downloadProspectusPdf(); }
    catch (e) { toast({ title: "Couldn't create the PDF", description: (e as Error).message || "Please try again.", variant: "destructive" }); }
    finally { setDownloading(false); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground prospectus-shell">
      <div className="prospectus-toolbar print:hidden">
        <Link to="/#practitioner" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={download} disabled={downloading || !rows?.length}>{downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download prospectus</Button>
          <Button onClick={() => setApply(1)}>Apply for Level 1</Button>
        </div>
      </div>
      {rows === null ? <p className="p-10 text-center text-muted-foreground">Loading…</p> : <ProspectusPages sections={rows} imageUrls={imageUrls} canvases={canvases} signed={signed} />}
      <div className="prospectus-actions print:hidden"><p>Ready to apply? Answer the four application questions.</p><Button onClick={() => setApply(1)}>Apply for Level 1</Button></div>
      <ApplyDialog level={apply} onClose={() => setApply(null)} />
    </div>
  );
}
