import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { clearPendingBuy, resolvePendingBuy } from "@/lib/pendingPurchase";

/** Safety net: a signed-in member who chose a product before sign-up but
 *  never finished payment (incl. leaving Stripe) is sent back to payment
 *  instead of seeing onboarding steps for access they don't hold. */
export default function PendingPurchaseBanner({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const { user } = useAuth();
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get("purchase") === "success") {
      clearPendingBuy();
      supabase.auth.updateUser({ data: { pending_buy: null, pending_buy_at: null } }).catch(() => {});
      return;
    }
    (async () => {
      const id = await resolvePendingBuy(user);
      if (!id) return;
      const [{ data }, { data: held }] = await Promise.all([
        supabase.from("products").select("id, name").eq("id", id).maybeSingle(),
        supabase.from("entitlements").select("id").eq("user_id", user.id).eq("product_id", id).eq("status", "active").limit(1),
      ]);
      if (held && held.length > 0) {
        clearPendingBuy();
        supabase.auth.updateUser({ data: { pending_buy: null, pending_buy_at: null } }).catch(() => {});
        return;
      }
      if (data) setProduct({ id: data.id, name: data.name });
    })();
  }, [user]);

  useEffect(() => { onPendingChange?.(!!product); }, [product, onPendingChange]);

  if (!product) return null;
  return (
    <div className="rounded-2xl border-2 border-secondary bg-secondary/10 p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-foreground">You chose <strong>{product.name}</strong> - continue to payment to finish joining.</p>
      <Link to={`/?buy=${product.id}`} className="rounded-full bg-primary px-4 py-2 text-primary-foreground font-medium">
        Continue to payment
      </Link>
    </div>
  );
}
