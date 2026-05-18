import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Lock, Check } from "lucide-react";
import { TIERS, TierKey } from "@/lib/tiers";
import { useAuth } from "@/contexts/AuthContext";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";
import logo from "@/assets/13creators-logo.png";
import birdWren from "@/assets/bird-wren.png";
import birdRobin from "@/assets/bird-robin.png";
import birdFalcon from "@/assets/bird-falcon.png";
import birdOwl from "@/assets/bird-owl.png";

const stripePromise = loadStripe("pk_test_51PGxKUKn3GaB6FyY1qeTOeYxWnBMDax8bUZhdP7RggDi1OyUp4BbSJWPhgb7hcvDynNqakuSfpGzwfuVhOsTvXmb001lwoCn7a");

const BIRD_IMAGES: Record<TierKey, string> = {
  wren: birdWren,
  robin: birdRobin,
  falcon: birdFalcon,
  owl: birdOwl,
};

export default function Payment() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const tier = (params.get("tier") as TierKey) || "robin";
  const billing = params.get("billing") || "monthly";
  const canceled = params.get("canceled") === "true";
  const isUpgrade = params.get("upgrade") === "true";
  const tierInfo = TIERS[tier] || TIERS.robin;
  const tierImage = BIRD_IMAGES[tier];

  // Fall back to URL params for unverified users coming from Signup
  const userEmail = user?.email || params.get("email") || "";
  const userId = user?.id || params.get("uid") || "";

  const price = billing === "annual" ? tierInfo.annualPrice : tierInfo.monthlyPrice;

  // Once auth is done loading, if we still have no email, redirect to auth with returnTo
  useEffect(() => {
    if (!authLoading && !userEmail && !userId) {
      const returnTo = encodeURIComponent(`/enroll/payment?tier=${tier}&billing=${billing}`);
      navigate(`/auth?returnTo=${returnTo}`, { replace: true });
    }
  }, [authLoading, userEmail, userId, tier, billing, navigate]);

  const fetchClientSecret = useCallback(async () => {
    const priceId = tierInfo.stripe?.price_id;
    if (!priceId) throw new Error("No Stripe price configured for this tier.");

    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        email: userEmail,
        user_id: userId,
        tier,
        billing,
        embedded: true,
        successUrl: `${window.location.origin}/enroll/practitioner?tier=${tier}&billing=${billing}&payment=success${isUpgrade ? "&upgrade=true" : ""}`,
      },
    });

    if (error || !data?.clientSecret) {
      console.error("Checkout error:", error, data);
      throw new Error(error?.message || "Could not create checkout session.");
    }

    return data.clientSecret;
  }, [tier, billing, userEmail, userId, tierInfo]);

  useEffect(() => {
    if (tier === "wren") {
      navigate("/enroll/details?tier=wren&billing=monthly", { replace: true });
    }
  }, [tier, navigate]);

  // Don't render Stripe until auth is resolved AND we have an email
  if (tier === "wren" || authLoading || !userEmail) return null;

  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={2} />

      <main className="container mx-auto px-4 py-10 max-w-6xl">
        {canceled && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-8 max-w-2xl mx-auto">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">Payment canceled</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No charge was made. You can try again whenever you're ready.
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* LEFT: Order summary */}
          <div className="lg:col-span-4">
            <div className="sticky top-8">
              <div className="bg-gradient-to-br from-[hsl(45_40%_97%)] to-[hsl(35_25%_92%)] border border-border rounded-2xl overflow-hidden shadow-sm">
                {/* Top accent bar */}
                <div className="h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />

                <div className="p-6">
                  <img src={logo} alt="13 Creators" className="h-8 mb-6 opacity-80" />

                  {/* Bird + tier info */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="h-20 w-20 rounded-full bg-background border-2 border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src={tierImage}
                        alt={`${tierInfo.name} tier`}
                        className="h-16 w-16 object-contain"
                      />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-foreground leading-tight">
                        {tierInfo.name}
                      </h2>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                        {tierInfo.subtitle}
                      </p>
                      <div className="mt-1">
                        <span className="text-2xl font-display font-bold text-primary">
                          ${billing === "annual" ? Math.round(tierInfo.annualPrice / 12) : tierInfo.monthlyPrice}
                        </span>
                        <span className="text-sm text-muted-foreground">/mo</span>
                      </div>
                    </div>
                  </div>

                  {billing === "annual" && tierInfo.annualPrice > 0 && (
                    <div className="bg-secondary/10 text-foreground text-xs font-medium rounded-lg px-3 py-1.5 mb-4 inline-block">
                      💰 Save ${tierInfo.monthlyPrice * 12 - tierInfo.annualPrice}/yr with annual billing
                    </div>
                  )}

                  <div className="border-t border-border/60 my-4" />

                  <ul className="space-y-2.5">
                    {tierInfo.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="border-t border-border/60 my-4" />

                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-foreground">Total today</span>
                    <div className="text-right">
                      <span className="text-lg font-display font-bold text-foreground">
                        A${price}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {billing === "annual" ? "/yr" : "/mo"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
                <Lock className="h-3.5 w-3.5" />
                <span>Secured with 256-bit SSL encryption</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Embedded Stripe checkout */}
          <div className="lg:col-span-8 relative">
            <div className="rounded-2xl overflow-hidden shadow-sm border border-border" style={{ position: 'relative', zIndex: 1 }}>
              <div id="stripe-checkout-container" className="min-h-[500px]">
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ fetchClientSecret }}
                >
                  <EmbeddedCheckout className="stripe-embedded-checkout" />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
