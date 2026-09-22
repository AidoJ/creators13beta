/**
 * Clinic Profile referral — L1/L2 certified practitioners refer a client in
 * for A'Hara to profile personally.
 *
 * The practitioner captures Name / Phone / Email only (deliberately no date of
 * birth: the client supplies that themselves in the normal enrolment Details
 * step, so the existing guardian-consent flow applies unchanged).
 *
 * On submit we create the invitation, then send the practitioner to checkout
 * for the $50 Clinic Profile product. The client's invite email goes out from
 * the payment webhook once the charge succeeds — never before.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Stethoscope, Loader2, CreditCard } from "lucide-react";
import { getAppOrigin } from "@/lib/appOrigin";

interface ClinicInvite {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paid_at: string | null;
  redeemed_at: string | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  price_cents: number | null;
  currency: string | null;
}

function stageLabel(inv: ClinicInvite) {
  if (inv.redeemed_at) return { label: "Signed up — with A'Hara", cls: "border-forest/40 text-forest" };
  if (inv.paid_at) return { label: "Paid — awaiting client signup", cls: "border-primary/40 text-primary" };
  return { label: "Unpaid", cls: "border-destructive/40 text-destructive" };
}

export default function ClinicReferralForm() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [invites, setInvites] = useState<ClinicInvite[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: prod }, { data: rows }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price_cents, currency")
        .eq("name", "Clinic Profile")
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("client_invitations")
        .select("id, name, email, phone, status, paid_at, redeemed_at, created_at")
        .eq("practitioner_id", user.id)
        .eq("kind", "clinic_profile")
        .order("created_at", { ascending: false }),
    ]);
    setProduct((prod as Product) ?? null);
    setInvites((rows as ClinicInvite[]) ?? []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function startCheckout(invitationId: string) {
    if (!product) return;
    const origin = getAppOrigin();
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        product_id: product.id,
        invitation_id: invitationId,
        successUrl: `${origin}/practitioner?tab=clinic&purchase=success`,
        cancelUrl: `${origin}/practitioner?tab=clinic&purchase=canceled`,
      },
    });
    if (error || !data?.url) {
      toast({
        title: "Couldn't open payment",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      return false;
    }
    window.location.href = data.url as string;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !product) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("client_invitations")
      .insert({
        practitioner_id: user.id,
        name,
        email,
        phone: phone || null,
        kind: "clinic_profile",
        product_id: product.id,
        grants_level_key: "profile_body",
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast({
        title: "Couldn't create referral",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    await startCheckout(data.id);
    setBusy(false);
  }

  const price = product?.price_cents ? `$${(product.price_cents / 100).toFixed(0)}` : "$50";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <Stethoscope className="h-4 w-4 text-primary" />
          Refer a client for a Clinic Profile
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          You pay {price} for the profiling. Your client then receives their own
          invitation to complete their details and upload their photos. A'Hara
          assigns their Creator Types, and they stay linked to you.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 400 000 000" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={busy || !name || !email || !product}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CreditCard className="h-3.5 w-3.5 mr-1" /> Continue to payment — {price}</>}
          </Button>
          {!product && (
            <p className="text-xs text-destructive">Clinic Profile isn't available right now.</p>
          )}
        </form>
      </div>

      {invites.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Clinic referrals
              <span className="text-muted-foreground font-normal ml-2">{invites.length}</span>
            </h3>
          </div>
          <div className="divide-y divide-border">
            {invites.map((inv) => {
              const stage = stageLabel(inv);
              return (
                <div key={inv.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inv.email}{inv.phone ? ` • ${inv.phone}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${stage.cls}`}>
                    {stage.label}
                  </Badge>
                  {!inv.paid_at && (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0"
                      onClick={() => startCheckout(inv.id)}>
                      Pay {price}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
