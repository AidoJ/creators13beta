import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { APPLICATION_QUESTIONS } from "@/lib/prospectus";
import ProspectusEditor from "./ProspectusEditor";

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  level: number;
  message: string | null;
  answers: string[] | null;
  status: string;
  payment_product_id: string | null;
  payment_link_sent_at: string | null;
  created_at: string;
}
interface ProductOpt { id: string; name: string; price_cents: number | null; is_visible_on_storefront: boolean }

const STATUSES = ["new", "contacted", "accepted", "declined"];

export default function PractitionerApplicationsPanel() {
  const [rows, setRows] = useState<Application[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const focusId = new URLSearchParams(window.location.search).get("application");

  const load = useCallback(async () => {
    const [{ data }, { data: prods }] = await Promise.all([
      supabase.from("practitioner_applications" as any)
        .select("id, name, email, phone, level, message, answers, status, payment_product_id, payment_link_sent_at, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, price_cents, is_visible_on_storefront").eq("active", true).order("name"),
    ]);
    setRows((data as unknown as Application[]) ?? []);
    setProducts((prods as ProductOpt[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`application-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading]);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase
      .from("practitioner_applications" as any)
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    setRows((r) => r.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  async function sendLink(a: Application) {
    const productId = pick[a.id] ?? a.payment_product_id;
    if (!productId) { toast({ title: "Choose a product first", variant: "destructive" }); return; }
    setSending(a.id);
    const { data, error } = await supabase.functions.invoke("send-training-payment-link", {
      body: { application_id: a.id, product_id: productId },
    });
    setSending(null);
    if (error || (data as any)?.error) {
      toast({ title: "Couldn't send the link", description: (data as any)?.message || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment link emailed", description: a.email });
    load();
  }

  const fmt = (c: number | null) => (c ? `A$${(c / 100).toFixed(0)}` : "free");

  return (
    <div className="space-y-6">
      <ProspectusEditor />
      <h3 className="font-display text-xl">Applications</h3>
      {loading ? <p className="text-sm text-muted-foreground">Loading applications…</p>
        : !rows.length ? <p className="text-sm text-muted-foreground">No practitioner applications yet.</p>
        : (
        <div className="space-y-3">
          {rows.map((a) => (
            <div key={a.id} id={`application-${a.id}`} className={`rounded-2xl bg-card p-4 scroll-mt-28 ${a.id === focusId ? "border-2 border-primary" : "border border-border"}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{a.name}</span>
                <Badge variant="outline">{a.level === 1 ? "Level 1 application" : "Level 2/3 interest"}</Badge>
                <Badge variant={a.status === "new" ? "default" : "secondary"}>{a.status}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-muted-foreground">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
              {a.answers?.length ? (
                <div className="mt-3 space-y-2">
                  {APPLICATION_QUESTIONS.map((q, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium">{i + 1}. {q}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{a.answers?.[i] || "—"}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {a.message && <p className="text-sm mt-2 whitespace-pre-wrap">{a.message}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {STATUSES.filter((s) => s !== a.status).map((s) => (
                  <Button key={s} size="sm" variant="outline" className="text-xs" onClick={() => setStatus(a.id, s)}>Mark {s}</Button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <select
                  aria-label="Product to charge"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={pick[a.id] ?? a.payment_product_id ?? ""}
                  onChange={(e) => setPick((p) => ({ ...p, [a.id]: e.target.value }))}
                >
                  <option value="">Choose product to charge…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {fmt(p.price_cents)}{p.is_visible_on_storefront ? "" : " (not in shop)"}</option>
                  ))}
                </select>
                <Button size="sm" disabled={sending === a.id} onClick={() => sendLink(a)}>
                  {sending === a.id ? "Sending…" : a.payment_link_sent_at ? "Resend payment link" : "Accept & send payment link"}
                </Button>
                {a.payment_link_sent_at && (
                  <span className="text-xs text-muted-foreground">Link sent {new Date(a.payment_link_sent_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
