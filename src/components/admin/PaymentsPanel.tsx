import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Download, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";

// All period maths is in Australia/Brisbane (UTC+10, no daylight saving).
const BNE = 10 * 3600 * 1000;
const GST_THRESHOLD = 7_500_000; // cents
const GST_AMBER = 6_000_000;

type Pay = {
  id: string; event_type: string; livemode: boolean; occurred_at: string; user_id: string | null;
  member_email: string | null; member_name: string | null; product_name: string | null; billing_shape: string | null;
  term_months: number | null; amount_cents: number | null; currency: string | null; fee_cents: number | null;
  net_cents: number | null; status: string | null; stripe_charge_id: string | null; stripe_invoice_id: string | null;
  stripe_subscription_id: string | null; referring_practitioner_id: string | null;
};
type Sub = {
  stripe_subscription_id: string; livemode: boolean; user_id: string | null; member_name: string | null; member_email: string | null;
  product_name: string | null; billing_shape: string | null; term_months: number | null; amount_cents: number | null;
  currency: string | null; billing_interval: string | null; interval_count: number | null; status: string | null;
  cancel_at_period_end: boolean; cancel_at: string | null; started_at: string | null; current_period_end: string | null;
};
type Gst = { registered: boolean; registered_from: string | null };

const bneParts = (ms: number) => { const d = new Date(ms + BNE); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() }; };
const monthStart = (y: number, m: number) => Date.UTC(y, m, 1) - BNE; // handles m overflow
const dayStart = (iso: string) => Date.parse(iso + "T00:00:00Z") - BNE;
const bneDay = (ms: number) => new Date(ms + BNE).toISOString().slice(0, 10);
const money = (c: number, cur = "aud") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase() }).format(c / 100);
const ACTIVE = ["active", "trialing", "past_due"];
const monthlyAmount = (s: Sub) => {
  const a = s.amount_cents ?? 0; const n = s.interval_count || 1;
  if (s.billing_interval === "year") return Math.round(a / (12 * n));
  if (s.billing_interval === "week") return Math.round((a * 52) / (12 * n));
  return Math.round(a / n);
};

type Preset = "this_month" | "last_month" | "quarter" | "ytd" | "cal_ytd" | "custom";

export default function PaymentsPanel() {
  const [mode, setMode] = useState<"test" | "live">("test");
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [allPays, setPays] = useState<Pay[]>([]); const [allSubs, setSubs] = useState<Sub[]>([]);
  const [hideUnmatched, setHideUnmatched] = useState(true);
  const pays = useMemo(() => hideUnmatched ? allPays.filter((p) => p.user_id && p.product_id) : allPays, [allPays, hideUnmatched]);
  const subs = useMemo(() => hideUnmatched ? allSubs.filter((s) => s.user_id && s.product_id) : allSubs, [allSubs, hideUnmatched]);
  const hiddenPays = allPays.length - pays.length; const hiddenSubs = allSubs.length - subs.length;
  const [gst, setGst] = useState<Gst>({ registered: false, registered_from: null });
  const [gstDraft, setGstDraft] = useState<Gst>({ registered: false, registered_from: null });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null);
  const [stripeLive, setStripeLive] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const live = mode === "live";
    const [p, s, g] = await Promise.all([
      supabase.from("payments" as any).select("*").eq("livemode", live).order("occurred_at", { ascending: false }).limit(10000),
      supabase.from("payment_subscriptions" as any).select("*").eq("livemode", live).limit(10000),
      supabase.rpc("get_gst_setting" as any),
    ]);
    if (p.error) toast({ title: "Could not load payments", description: p.error.message, variant: "destructive" });
    setPays((p.data as any) ?? []); setSubs((s.data as any) ?? []);
    const gv = ((g.data as any) ?? { registered: false, registered_from: null }) as Gst;
    setGst(gv); setGstDraft(gv); setLoading(false);
  }, [mode]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.functions.invoke("admin-payments", { body: { action: "mode" } }).then(({ data }) => setStripeLive(data?.livemode ?? null));
  }, []);

  const now = Date.now();
  const { y, m } = bneParts(now);
  const [start, end] = useMemo<[number, number]>(() => {
    if (preset === "this_month") return [monthStart(y, m), monthStart(y, m + 1)];
    if (preset === "last_month") return [monthStart(y, m - 1), monthStart(y, m)];
    if (preset === "quarter") { const q = Math.floor(m / 3) * 3; return [monthStart(y, q), monthStart(y, q + 3)]; }
    if (preset === "ytd") return [monthStart(m >= 6 ? y : y - 1, 6), now];
    if (preset === "cal_ytd") return [monthStart(y, 0), now];
    const s = from ? dayStart(from) : monthStart(y, m);
    const e = to ? dayStart(to) + 86400000 : now;
    return [s, e];
  }, [preset, from, to, y, m, now]);

  const gstPart = useCallback((p: Pay) => {
    if (!gst.registered || !gst.registered_from || p.amount_cents == null) return 0;
    return bneDay(Date.parse(p.occurred_at)) >= gst.registered_from ? Math.round(p.amount_cents / 11) : 0;
  }, [gst]);

  // Instalment numbers per subscription (in payment order).
  const instalment = useMemo(() => {
    const map = new Map<string, number>(); const counters = new Map<string, number>();
    [...pays].filter((p) => p.event_type === "payment" && p.stripe_subscription_id)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .forEach((p) => { const n = (counters.get(p.stripe_subscription_id!) ?? 0) + 1; counters.set(p.stripe_subscription_id!, n); map.set(p.id, n); });
    return { map, counters };
  }, [pays]);

  const inRange = useMemo(() => pays.filter((p) => { const t = Date.parse(p.occurred_at); return t >= start && t < end; }), [pays, start, end]);
  const money$ = (p: Pay) => p.event_type === "payment" || p.event_type === "refund";
  const nonAud = inRange.filter((p) => money$(p) && p.currency && p.currency !== "aud");
  const aud = inRange.filter((p) => money$(p) && (p.currency ?? "aud") === "aud");

  const gross = aud.filter((p) => p.event_type === "payment").reduce((a, p) => a + (p.amount_cents ?? 0), 0);
  const refunds = aud.filter((p) => p.event_type === "refund").reduce((a, p) => a + (p.amount_cents ?? 0), 0);
  const revenue = gross + refunds;
  const fees = aud.reduce((a, p) => a + (p.fee_cents ?? 0), 0);
  const feesPending = aud.filter((p) => p.event_type === "payment" && p.fee_cents == null).length;
  const gstTotal = aud.reduce((a, p) => a + gstPart(p), 0);

  const activeSubs = subs.filter((s) => ACTIVE.includes(s.status ?? ""));
  const recurringActive = activeSubs.filter((s) => s.billing_shape !== "fixed_term");
  const courseActive = activeSubs.filter((s) => s.billing_shape === "fixed_term");
  const remainingFor = (s: Sub) => Math.max(0, (s.term_months ?? 0) - (instalment.counters.get(s.stripe_subscription_id) ?? 0));
  const mrrRecurring = recurringActive.reduce((a, s) => a + monthlyAmount(s), 0);
  const mrrCourses = courseActive.filter((s) => remainingFor(s) > 0).reduce((a, s) => a + monthlyAmount(s), 0);
  const activeMembers = new Set(activeSubs.map((s) => s.user_id ?? s.stripe_subscription_id)).size;
  const newSubs = subs.filter((s) => s.started_at && Date.parse(s.started_at) >= start && Date.parse(s.started_at) < end).length;
  const cancelledEv = inRange.filter((p) => p.event_type === "cancellation");

  // Coming up (next Brisbane month). Uses each subscriber's ACTUAL price.
  const notCancelling = (s: Sub) => !s.cancel_at && !s.cancel_at_period_end;
  const nextRecurring = recurringActive.filter(notCancelling).reduce((a, s) => a + monthlyAmount(s), 0);
  const nextCourses = courseActive.filter((s) => remainingFor(s) > 0).reduce((a, s) => a + monthlyAmount(s), 0);
  const courseRows = useMemo(() => {
    const g = new Map<string, { students: number; remaining: number; amount: number }>();
    courseActive.forEach((s) => {
      const r = remainingFor(s); if (!r) return;
      const k = s.product_name ?? "Unknown course"; const cur = g.get(k) ?? { students: 0, remaining: 0, amount: 0 };
      cur.students++; cur.remaining += r; cur.amount += r * (s.amount_cents ?? 0); g.set(k, cur);
    });
    return [...g.entries()];
  }, [courseActive, instalment]); // eslint-disable-line react-hooks/exhaustive-deps

  // GST threshold tracker (always ex-GST once registered).
  const exGst = (p: Pay) => (p.amount_cents ?? 0) - gstPart(p);
  const rolling12 = pays.filter((p) => money$(p) && (p.currency ?? "aud") === "aud" && Date.parse(p.occurred_at) >= monthStart(y, m - 11))
    .reduce((a, p) => a + exGst(p), 0);
  const thisMonthSoFar = pays.filter((p) => money$(p) && (p.currency ?? "aud") === "aud" && Date.parse(p.occurred_at) >= monthStart(y, m))
    .reduce((a, p) => a + exGst(p), 0);
  let projected = thisMonthSoFar;
  for (let k = 1; k <= 11; k++) {
    let month = recurringActive.filter(notCancelling).reduce((a, s) => a + monthlyAmount(s), 0);
    month += courseActive.filter((s) => remainingFor(s) >= k).reduce((a, s) => a + monthlyAmount(s), 0);
    projected += gst.registered ? Math.round((month * 10) / 11) : month;
  }

  const byProduct = useMemo(() => {
    const g = new Map<string, { units: number; gross: number; refunds: number }>();
    aud.forEach((p) => {
      const k = p.product_name ?? "Unknown"; const cur = g.get(k) ?? { units: 0, gross: 0, refunds: 0 };
      if (p.event_type === "payment") { cur.units++; cur.gross += p.amount_cents ?? 0; } else cur.refunds += p.amount_cents ?? 0;
      g.set(k, cur);
    });
    return [...g.entries()].sort((a, b) => b[1].gross - a[1].gross);
  }, [aud]);

  const referrals = useMemo(() => {
    const g = new Map<string, { name: string; count: number; total: number }>();
    aud.filter((p) => p.referring_practitioner_id).forEach((p) => {
      const k = p.referring_practitioner_id!; const cur = g.get(k) ?? { name: p.member_name || p.member_email || "Practitioner", count: 0, total: 0 };
      if (p.event_type === "payment") cur.count++; cur.total += p.amount_cents ?? 0; g.set(k, cur);
    });
    return [...g.values()];
  }, [aud]);

  const scheduled = subs.filter((s) => ACTIVE.includes(s.status ?? "") && s.billing_shape !== "fixed_term" && !notCancelling(s));
  const overdue = subs.filter((s) => s.status === "past_due" || s.status === "unpaid");
  const failedEv = inRange.filter((p) => p.event_type === "failed");

  const stripeUrl = (p: Pay) => {
    const base = `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}`;
    if (p.stripe_charge_id) return `${base}payments/${p.stripe_charge_id}`;
    if (p.stripe_invoice_id) return `${base}invoices/${p.stripe_invoice_id}`;
    if (p.stripe_subscription_id) return `${base}subscriptions/${p.stripe_subscription_id}`;
    return null;
  };
  const typeLabel: Record<string, string> = {
    payment: "Payment", refund: "Refund", failed: "Failed payment", cancellation: "Cancelled",
    cancellation_scheduled: "Scheduled to cancel", course_completed: "Course completed",
  };

  const exportCsv = () => {
    const head = ["Mode", "Date (Brisbane)", "Type", "Member", "Email", "Product", "Instalment", "Amount", ...(gst.registered ? ["GST"] : []), "Stripe fee", "Net", "Currency", "Status", "Stripe reference", "Stripe link"];
    const rows = inRange.map((p) => {
      const inst = instalment.map.get(p.id);
      return [mode.toUpperCase(), new Date(Date.parse(p.occurred_at) + BNE).toISOString().replace("T", " ").slice(0, 16), typeLabel[p.event_type] ?? p.event_type,
        p.member_name ?? "", p.member_email ?? "", p.product_name ?? "", inst ? `${inst}${p.term_months && p.billing_shape === "fixed_term" ? ` of ${p.term_months}` : ""}` : "",
        p.amount_cents != null ? (p.amount_cents / 100).toFixed(2) : "", ...(gst.registered ? [(gstPart(p) / 100).toFixed(2)] : []),
        p.fee_cents != null ? (p.fee_cents / 100).toFixed(2) : "", p.net_cents != null ? (p.net_cents / 100).toFixed(2) : "",
        (p.currency ?? "").toUpperCase(), p.status ?? "", p.stripe_charge_id ?? p.stripe_invoice_id ?? p.stripe_subscription_id ?? "", stripeUrl(p) ?? ""];
    });
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `payments-${mode.toUpperCase()}-${bneDay(start)}-to-${bneDay(end - 1)}.csv`; a.click();
  };

  const runImport = async () => {
    setBusy("import"); let body: any = { action: "import" }; let total = 0;
    try {
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase.functions.invoke("admin-payments", { body });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        total += data.processed ?? 0;
        if (data.done) break;
        body = { action: "import", phase: data.phase, cursor: data.cursor };
      }
      toast({ title: "Import finished", description: `${total} Stripe records checked. Already-recorded items were skipped.` });
      await load();
    } catch (e: any) { toast({ title: "Import stopped", description: e.message, variant: "destructive" }); }
    setBusy(null);
  };
  const runAction = async (action: string, label: string) => {
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("admin-payments", { body: { action } });
    if (error || data?.error) toast({ title: `${label} failed`, description: data?.error || error?.message, variant: "destructive" });
    else toast({ title: label, description: action === "fill_fees" ? `${data.filled} of ${data.checked} fees filled in` : data.added?.length ? `Added: ${data.added.join(", ")}` : "Already up to date" });
    setBusy(null); load();
  };
  const saveGst = async () => {
    if (gstDraft.registered && !gstDraft.registered_from) { toast({ title: "Choose the registration date", variant: "destructive" }); return; }
    const value = { registered: gstDraft.registered, registered_from: gstDraft.registered ? gstDraft.registered_from : null };
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("system_settings").upsert({ key: "gst", value, updated_by: u.user?.id, updated_at: new Date().toISOString() } as any, { onConflict: "key" });
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else { toast({ title: "GST setting saved" }); setGst(value); }
  };

  const modeMismatch = stripeLive !== null && (mode === "live") !== stripeLive;
  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
  const Tracker = ({ label, value, note }: { label: string; value: number; note: string }) => {
    const level = value >= GST_THRESHOLD ? "red" : value >= GST_AMBER ? "amber" : "ok";
    const pct = Math.min(100, (value / GST_THRESHOLD) * 100);
    return (
      <div className={`rounded-lg border p-4 ${level === "red" ? "border-destructive bg-destructive/10" : level === "amber" ? "border-gold bg-gold/10" : "border-border bg-card"}`}>
        <div className="flex justify-between text-sm"><span className="text-foreground">{label}</span><span className="font-semibold text-foreground">{money(value)} / {money(GST_THRESHOLD)}</span></div>
        <div className="h-2 rounded bg-muted mt-2 overflow-hidden"><div className={`h-full ${level === "red" ? "bg-destructive" : level === "amber" ? "bg-gold" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-muted-foreground mt-2">{note}</p>
        {level !== "ok" && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${level === "red" ? "text-destructive" : "text-gold"}`}>
            <AlertTriangle className="h-3 w-3" />
            {level === "red" ? "Over $75,000 — GST registration is due within 21 days of reaching the threshold." : "Approaching $75,000 (over $60,000). Registration is due within 21 days of reaching $75,000."}
          </p>
        )}
      </div>
    );
  };
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-2"><h3 className="text-base font-semibold text-foreground">{title}</h3>{children}</section>
  );

  return (
    <div className="space-y-6">
      {/* Mode + range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Data</p>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["test", "live"] as const).map((k) => (
              <button key={k} onClick={() => setMode(k)} className={`px-4 py-1.5 text-sm ${mode === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
                {k === "test" ? "Test" : "Live"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Period (Brisbane time)</p>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="ytd">Financial year to date</SelectItem>
              <SelectItem value="cal_ytd">Calendar year to date</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (<>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
        </>)}
        <label className="flex items-center gap-2 text-sm text-foreground pb-1.5">
          <Switch checked={hideUnmatched} onCheckedChange={setHideUnmatched} aria-label="Hide unmatched" />
          Hide unmatched
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runImport} disabled={!!busy || modeMismatch}>{busy === "import" ? "Importing…" : "Import from Stripe"}</Button>
          <Button variant="outline" size="sm" onClick={() => runAction("fill_fees", "Fees")} disabled={!!busy || modeMismatch}>Fill in fees</Button>
          <Button variant="outline" size="sm" onClick={() => runAction("ensure_webhook", "Stripe events")} disabled={!!busy || modeMismatch}>Check Stripe events</Button>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      {hideUnmatched && (hiddenPays > 0 || hiddenSubs > 0) && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground" role="status">
          Hiding {hiddenPays} payment record{hiddenPays === 1 ? "" : "s"}{hiddenSubs ? ` and ${hiddenSubs} subscription${hiddenSubs === 1 ? "" : "s"}` : ""} not matched to a member or product. All totals below exclude them. Turn off "Hide unmatched" to include them.
        </p>
      )}

      {mode === "test"
        ? <div className="rounded-md border-2 border-dashed border-gold bg-gold/10 px-4 py-2 text-sm font-semibold text-gold">TEST DATA — test-card payments only. Not real money.</div>
        : <div className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground">LIVE DATA — real payments.</div>}
      {modeMismatch && <p className="text-xs text-muted-foreground">Stripe is currently connected in {stripeLive ? "live" : "test"} mode, so import and fee tools only run for {stripeLive ? "Live" : "Test"}.</p>}
      <p className="text-xs text-muted-foreground">{bneDay(start)} to {bneDay(end - 1)}{loading ? " · loading…" : ""}</p>

      <Section title="Headline">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Revenue after refunds" value={money(revenue)} sub={`${money(gross)} paid − ${money(-refunds)} refunded`} />
          {gst.registered && <Card label="GST included" value={money(gstTotal)} sub={`Payments from ${gst.registered_from}`} />}
          <Card label="Stripe fees" value={money(fees)} sub={feesPending ? `${feesPending} fee(s) not yet available` : undefined} />
          <Card label="Net received" value={money(revenue - fees)} />
          <Card label="Active subscribers" value={String(activeMembers)} />
          <Card label="Monthly recurring income" value={money(mrrRecurring + mrrCourses)} sub={`Memberships ${money(mrrRecurring)} · Courses ${money(mrrCourses)}`} />
          <Card label="New subscriptions" value={String(newSubs)} />
          <Card label="Cancelled subscriptions" value={String(cancelledEv.length)} />
        </div>
        {nonAud.length > 0 && <p className="text-xs text-muted-foreground">{nonAud.length} non-AUD transaction(s) are excluded from totals and shown in the list.</p>}
      </Section>

      <Section title="GST threshold tracker">
        <p className="text-xs text-muted-foreground">Guide only — confirm with your accountant. {gst.registered ? "Figures exclude GST." : "Not GST registered: figures are the full amounts paid."}</p>
        <div className="grid md:grid-cols-2 gap-3">
          <Tracker label="Rolling 12 months" value={rolling12} note="This month so far + previous 11 months, after refunds." />
          <Tracker label="Projected 12 months" value={projected} note="Includes committed memberships and course instalments only - not future one-off sales. Add expected profile and other sales when checking against the $75,000 threshold." />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={gstDraft.registered} onCheckedChange={(v) => setGstDraft({ ...gstDraft, registered: v })} aria-label="GST registered" />
            GST registered
          </label>
          {gstDraft.registered && (
            <label className="flex items-center gap-2 text-sm text-foreground">From
              <Input type="date" value={gstDraft.registered_from ?? ""} onChange={(e) => setGstDraft({ ...gstDraft, registered_from: e.target.value || null })} className="w-40" />
            </label>
          )}
          <Button size="sm" onClick={saveGst} disabled={JSON.stringify(gstDraft) === JSON.stringify(gst)}>Save</Button>
          <p className="text-xs text-muted-foreground w-full">When on, receipts, this page and the CSV show GST as 1/11 of payments made on or after the registration date. Prices are not changed.</p>
        </div>
      </Section>

      <Section title="By product">
        <Table head={["Product", "Units", "Gross", "Refunds", "Net"]} rows={byProduct.map(([k, v]) => [k, String(v.units), money(v.gross), money(v.refunds), money(v.gross + v.refunds)])} empty="No payments in this period" />
      </Section>

      <Section title="Coming up — next month">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Memberships" value={money(nextRecurring)} sub="Actual amounts, excluding anyone scheduled to cancel" />
          <Card label="Course instalments" value={money(nextCourses)} />
          <Card label="Total expected" value={money(nextRecurring + nextCourses)} />
        </div>
        <Table head={["Course", "Students paying", "Instalments left", "Amount left"]} rows={courseRows.map(([k, v]) => [k, String(v.students), String(v.remaining), money(v.amount)])} empty="No course instalments remaining" />
        <p className="text-xs text-muted-foreground">Create and Co-Create end after their 13th instalment and are not projected beyond it. Move to Connect after 13 months: not yet decided.</p>
      </Section>

      <Section title="Cancellations and risk">
        <div className="grid grid-cols-3 gap-3">
          <Card label="Cancelled (period)" value={String(cancelledEv.length)} />
          <Card label="Scheduled to cancel" value={String(scheduled.length)} />
          <Card label="Failed / overdue" value={String(new Set([...overdue.map((s) => s.stripe_subscription_id), ...failedEv.map((p) => p.stripe_subscription_id ?? p.id)]).size)} />
        </div>
        <Table head={["Member", "Product", "Situation", "Amount"]} empty="Nothing to show"
          rows={[
            ...scheduled.map((s) => [s.member_name || s.member_email || "—", s.product_name ?? "—", `Cancels ${s.cancel_at ? bneDay(Date.parse(s.cancel_at)) : "at period end"}`, money(s.amount_cents ?? 0)]),
            ...overdue.map((s) => [s.member_name || s.member_email || "—", s.product_name ?? "—", "Payment overdue", money(s.amount_cents ?? 0)]),
            ...cancelledEv.map((p) => [p.member_name || p.member_email || "—", p.product_name ?? "—", `Cancelled ${bneDay(Date.parse(p.occurred_at))}`, "—"]),
          ]} />
      </Section>

      <Section title="Clinic referrals">
        <Table head={["Practitioner", "Referrals paid", "Total"]} rows={referrals.map((r) => [r.name, String(r.count), money(r.total)])} empty="No clinic referrals in this period" />
      </Section>

      <Section title="Transactions">
        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV ({mode.toUpperCase()})</Button></div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground"><tr>
              {["Date", "Type", "Member", "Product", "Amount", ...(gst.registered ? ["GST"] : []), "Fee", "Net", "Status", ""].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {inRange.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={10}>No transactions in this period</td></tr>}
              {inRange.map((p) => {
                const url = stripeUrl(p); const inst = instalment.map.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{bneDay(Date.parse(p.occurred_at))}</td>
                    <td className="p-2"><Badge variant={p.event_type === "refund" || p.event_type === "failed" ? "destructive" : "secondary"}>{typeLabel[p.event_type] ?? p.event_type}</Badge></td>
                    <td className="p-2">{p.member_name || p.member_email || "Unmatched"}</td>
                    <td className="p-2">{p.product_name ?? "—"}{inst && p.billing_shape === "fixed_term" ? ` (${inst} of ${p.term_months ?? "?"})` : ""}</td>
                    <td className="p-2 whitespace-nowrap">{p.amount_cents != null ? money(p.amount_cents, p.currency ?? "aud") : "—"}</td>
                    {gst.registered && <td className="p-2">{money$(p) ? money(gstPart(p)) : "—"}</td>}
                    <td className="p-2">{p.fee_cents != null ? money(p.fee_cents) : p.event_type === "payment" ? "pending" : "—"}</td>
                    <td className="p-2">{p.net_cents != null ? money(p.net_cents) : "—"}</td>
                    <td className="p-2 text-muted-foreground">{p.status}</td>
                    <td className="p-2">{url && <a href={url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">Stripe <ExternalLink className="h-3 w-3" /></a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground"><tr>{head.map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="p-3 text-muted-foreground">{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
