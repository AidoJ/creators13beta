import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin panel for exporting the marketing audience as CSV. Feeds the external
 * email tool (Mailchimp/Beehiiv/etc.). Default filter = player-path AND
 * opted-in only; pre-existing users (marketing_opt_in IS NULL) are excluded
 * unless the admin explicitly relaxes filters.
 */
export function MarketingPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [signupPath, setSignupPath] = useState<"player" | "paying" | "case_study" | "*">("player");
  const [optInOnly, setOptInOnly] = useState(true);

  async function exportCsv() {
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const url = new URL(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/admin-marketing-export`
      );
      url.searchParams.set("signup_path", signupPath);
      url.searchParams.set("opt_in_only", String(optInOnly));
      url.searchParams.set("app_origin", window.location.origin);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `marketing-audience-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast({ title: "Export downloaded" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h3 className="font-display text-lg">Marketing audience export</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Downloads a CSV of consented users for the external email tool. Each row includes a
          per-user tokenized unsubscribe URL that must be embedded in every send.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Signup path</Label>
        <RadioGroup
          value={signupPath}
          onValueChange={(v) => setSignupPath(v as any)}
          className="flex flex-wrap gap-4"
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="player" /> Player (free game)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="paying" /> Paying subscriber
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="case_study" /> Case study
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <RadioGroupItem value="*" /> All paths
          </label>
        </RadioGroup>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label className="text-sm">Opted-in only</Label>
          <p className="text-xs text-muted-foreground">
            Excludes pre-existing users (unknown consent) and anyone who unsubscribed.
          </p>
        </div>
        <Switch checked={optInOnly} onCheckedChange={setOptInOnly} />
      </div>

      <Button onClick={exportCsv} disabled={busy} className="rounded-full">
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Export CSV
      </Button>
    </Card>
  );
}
