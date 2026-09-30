import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type CatalogRow = {
  level_key: string;
  level_name: string;
  level_order: number;
  feature_key: string;
  feature_name: string;
  feature_category: string;
  held: boolean;
};

export default function WhatsIncluded() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (supabase as any).rpc("get_my_access_catalog").then(({ data }: { data?: CatalogRow[] }) => setRows(data ?? []));
  }, []);

  const held = useMemo(() => [...new Map(rows.filter((row) => row.held).map((row) => [row.feature_key, row])).values()], [rows]);
  const nextRows = rows.filter((row) => !row.held);
  const nextName = nextRows[0]?.level_name;
  if (!held.length) return null;

  return (
    <section className="border-y border-border py-5">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((value) => !value)}>
        <Sparkles className="h-5 w-5 text-secondary" />
        <span className="flex-1"><span className="block font-display text-lg">What&apos;s included</span><span className="block text-xs text-muted-foreground">{held.length} features currently available to you</span></span>
        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>
      {open && <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {held.map((row) => <div key={row.feature_key} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{row.feature_name}</span></div>)}
        {nextName && <div className="sm:col-span-2 mt-3 border-t border-border pt-3 text-sm text-muted-foreground">More in {nextName}: {nextRows.map((row) => row.feature_name).join(", ")}. <Button variant="link" className="h-auto p-0" asChild><a href="/shop">View options</a></Button></div>}
      </div>}
    </section>
  );
}