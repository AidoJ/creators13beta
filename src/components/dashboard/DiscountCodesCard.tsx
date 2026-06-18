import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Download, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CodeRow {
  code: string;
  percent: number;
  threshold: number;
  redeemed_at: string | null;
  created_at: string;
}

interface Props {
  userId: string;
}

/** Lists profile-discount codes the player has earned, with copy / download /
 *  use actions. Renders nothing when there are no codes. */
export default function DiscountCodesCard({ userId }: Props) {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("profile_discount_codes" as any)
        .select("code, percent, threshold, redeemed_at, created_at")
        .eq("user_id", userId)
        .order("percent", { ascending: false });
      setCodes(((data as any[]) ?? []) as CodeRow[]);
    })();
  }, [userId]);

  if (!codes.length) return null;

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
      toast({ title: "Code copied", description: code });
    } catch {
      toast({ title: "Could not copy", description: code, variant: "destructive" });
    }
  }

  function downloadCode(row: CodeRow) {
    const body = [
      "13 Creators — Profile Discount Code",
      "",
      `Code:        ${row.code}`,
      `Discount:    ${row.percent}% off your profiling assessment`,
      `Earned at:   ${row.threshold} game points`,
      `Valid for:   Profiling assessment ONLY`,
      `Not valid:   on any subscription (Wren / Robin / Falcon / Owl)`,
      `Issued:      ${new Date(row.created_at).toLocaleString()}`,
      "",
      "Enter this code at checkout when purchasing your profiling assessment.",
      "One-time use. Non-transferable.",
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `13creators-profile-discount-${row.code}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function useCode(row: CodeRow) {
    navigate(`/enroll?discount=${row.percent}&code=${encodeURIComponent(row.code)}`);
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Your discount codes</p>
          <p className="text-xs text-muted-foreground">
            Profiling assessment only — not valid on subscriptions.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {codes.map((row) => {
          const redeemed = !!row.redeemed_at;
          return (
            <li
              key={row.code}
              className={`rounded-lg border border-dashed p-3 flex flex-wrap items-center gap-3 ${
                redeemed ? "border-border bg-muted/30 opacity-70" : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex-1 min-w-[160px]">
                <div className="font-mono text-sm font-bold tracking-wider text-foreground select-all">
                  {row.code}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {row.percent}% off · earned at {row.threshold} pts
                  {redeemed && " · redeemed"}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCode(row.code)}
                  className="h-7 text-xs"
                  disabled={redeemed}
                >
                  {copiedCode === row.code ? (
                    <Check className="w-3 h-3 mr-1" />
                  ) : (
                    <Copy className="w-3 h-3 mr-1" />
                  )}
                  {copiedCode === row.code ? "Copied" : "Copy"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadCode(row)}
                  className="h-7 text-xs"
                  disabled={redeemed}
                >
                  <Download className="w-3 h-3 mr-1" /> Save
                </Button>
                {!redeemed && (
                  <Button size="sm" onClick={() => useCode(row)} className="h-7 text-xs">
                    Use
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
