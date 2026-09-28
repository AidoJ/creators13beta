import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, Download, XCircle, RotateCcw, Clock } from "lucide-react";
import { downloadReceipt, formatDate, formatMoney, type ReceiptItem } from "@/lib/generateReceiptPdf";
import { useToast } from "@/hooks/use-toast";

export default function PaymentHistory() {
  const { toast } = useToast();
  const [items, setItems] = useState<ReceiptItem[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions.invoke("payment-history").then(({ data, error }) => {
      if (error || !data?.items) { setError(true); setItems([]); return; }
      setItems(data.items); setEmail(data.email); setName(data.name);
    });
  }, []);

  const onDownload = async (it: ReceiptItem) => {
    setBusy(it.id);
    try { const { data: gst } = await supabase.rpc("get_gst_setting" as any);
      await downloadReceipt(it, email, name, (gst as any) ?? null); }
    catch { toast({ title: "Couldn't create receipt", variant: "destructive" }); }
    setBusy(null);
  };

  const icon = (k: ReceiptItem["kind"]) =>
    k === "payment" ? <Receipt className="h-4 w-4 text-primary" /> :
    k === "refund" ? <RotateCcw className="h-4 w-4 text-muted-foreground" /> :
    k === "cancellation" ? <XCircle className="h-4 w-4 text-destructive" /> :
    <Clock className="h-4 w-4 text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-4 w-4 text-primary" /> Payment History
        </CardTitle>
        <CardDescription>Your payments, refunds and cancellations. Download a receipt for any payment.</CardDescription>
      </CardHeader>
      <CardContent>
        {items === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">We couldn't load your payment history right now. Please try again later.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <li key={it.id} className="py-3 flex items-center gap-3">
                <div className="shrink-0">{icon(it.kind)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(it.date)}
                    {it.period_end && (it.kind === "cancellation_scheduled" || it.kind === "cancellation")
                      ? ` · access ${it.kind === "cancellation" ? "ended" : "ends"} ${formatDate(it.period_end)}`
                      : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  {it.amount != null && it.currency && (
                    <p className="text-sm font-medium">
                      {it.kind === "refund" ? "-" : ""}{formatMoney(it.amount, it.currency)}
                    </p>
                  )}
                  <Badge variant={it.kind === "cancellation" ? "destructive" : "secondary"} className="text-[0.6rem]">
                    {it.status}
                  </Badge>
                </div>
                {(it.kind === "payment" || it.kind === "refund") && (
                  <Button size="icon" variant="ghost" aria-label="Download receipt" disabled={busy === it.id} onClick={() => onDownload(it)}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
