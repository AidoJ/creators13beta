import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolvePendingBuy } from "@/lib/pendingPurchase";

/** Safety net: a signed-in member who chose a product before sign-up but
 *  never reached payment is reminded to continue instead of seeing only Free. */
export default function PendingPurchaseBanner() {
  const { user } = useAuth();
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get("purchase") === "success") return;
    (async () => {
      const id = await resolvePendingBuy(user);
      if (!id) return;
      const { data } = await supabase.from("products").select("id, name").eq("id", id).maybeSingle();
      if (data) setProduct({ id: data.id, name: data.name });
    })();
  }, [user]);

  if (!product) return null;
  return (
    <div className="rounded-2xl border-2 border-secondary bg-secondary/10 p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-foreground">You chose <strong>{product.name}</strong> — continue to payment to finish joining.</p>
      <Link to={`/?buy=${product.id}`} className="rounded-full bg-primary px-4 py-2 text-primary-foreground font-medium">
        Continue to payment
      </Link>
    </div>
  );
}
