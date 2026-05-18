import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { TIERS, TierKey } from "@/lib/tiers";
import { getAppOrigin } from "@/lib/appOrigin";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";

export default function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const tier = (params.get("tier") as TierKey) || "wren";
  const billing = params.get("billing") || "monthly";
  const caseStudy = params.get("case_study") === "true";
  const practitionerCode = params.get("practitioner_code") || "";
  const inviteToken = params.get("invite") || "";
  const tierInfo = TIERS[tier] || TIERS.wren;
  const authReturnParams = new URLSearchParams({ tier, billing });
  if (caseStudy) {
    authReturnParams.set("case_study", "true");
    authReturnParams.set("practitioner_code", practitionerCode);
    if (inviteToken) authReturnParams.set("invite", inviteToken);
  }
  const authReturnTo = tier === "wren"
    ? `/enroll?${authReturnParams.toString()}`
    : `/enroll/payment?${authReturnParams.toString()}`;

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [createdUserId, setCreatedUserId] = useState("");

  const [signingOut, setSigningOut] = useState(false);

  // If a practitioner (or any logged-in user) clicks a case-study invite link,
  // sign them out so the new client can create a fresh account with blank details.
  useEffect(() => {
    if (!user || signingOut || showVerification || loading) return;
    if (caseStudy) {
      setSigningOut(true);
      supabase.auth.signOut().then(() => setSigningOut(false));
    }
  }, [user, caseStudy, signingOut, showVerification, loading]);

  // If user arrives already authenticated (e.g. after email verification redirect), show "I'm Verified"
  const arrivedVerified = !!user && !showVerification && !loading && !caseStudy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setLoading(true);

    const appOrigin = getAppOrigin();

    // 1. Create auth account
    // Build redirect URL back to this signup page so verification lands on "I'm Verified"
    const verifyParams = new URLSearchParams({ tier, billing });
    if (caseStudy) {
      verifyParams.set("case_study", "true");
      verifyParams.set("practitioner_code", practitionerCode);
      if (inviteToken) verifyParams.set("invite", inviteToken);
    }
    const redirectUrl = `${appOrigin}/enroll/signup?${verifyParams.toString()}`;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });

    if (authError) {
      toast({ title: "Signup failed", description: authError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      toast({ title: "Signup failed", description: "No user ID returned", variant: "destructive" });
      setLoading(false);
      return;
    }
    setCreatedUserId(userId);

    // 2. Call the edge function to create all DB records (role, subscription, profile update)
    //    This works for both free and paid tiers — it handles everything server-side.
    const priceId = tierInfo.stripe?.price_id || null;

    const { error: fnError } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        email,
        user_id: userId,
        tier,
        billing,
        practitioner_code: practitionerCode || null,
        invite_token: inviteToken || null,
        successUrl: `${appOrigin}/enroll/practitioner?tier=${tier}&billing=${billing}&payment=skipped`,
        cancelUrl: `${appOrigin}/enroll/payment?tier=${tier}&billing=${billing}&canceled=true`,
      },
    });

    if (fnError) {
      console.error("Edge function error:", fnError);
      // Non-blocking — user is created, DB records may still need fixing
    }

    // 3. If case study, send welcome email with login details and photo upload prompt
    if (caseStudy) {
      const appOrigin = getAppOrigin();
      const returnToPath = `/enroll/practitioner?tier=${tier}&billing=${billing}&case_study=true&practitioner_code=${encodeURIComponent(practitionerCode)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""}`;
      const loginUrl = `${appOrigin}/auth?returnTo=${encodeURIComponent(returnToPath)}`;
      const photosUrl = `${appOrigin}/enroll/photos?tier=${tier}&billing=${billing}&case_study=true&practitioner_code=${practitionerCode}`;
      supabase.functions.invoke("send-case-study-welcome", {
        body: {
          to: email,
          clientName: email.split("@")[0],
          loginLink: loginUrl,
          photosLink: photosUrl,
          practitionerCode: practitionerCode || "",
        },
      }).then(({ error: emailErr }) => {
        if (emailErr) console.error("Welcome email error:", emailErr);
        else console.log("✓ Case study welcome email queued");
      });
    }

    setLoading(false);
    setShowVerification(true);
  };

  const handleContinue = () => {
    const nextParams = new URLSearchParams({ tier, billing });
    if (createdUserId) nextParams.set("uid", createdUserId);
    else if (user) nextParams.set("uid", user.id);
    if (email) nextParams.set("email", email);
    else if (user?.email) nextParams.set("email", user.email);
    if (caseStudy) {
      nextParams.set("case_study", "true");
      nextParams.set("practitioner_code", practitionerCode);
      if (inviteToken) nextParams.set("invite", inviteToken);
    }
    if (tier === "wren") {
      navigate(`/enroll/practitioner?${nextParams.toString()}`);
    } else {
      navigate(`/enroll/payment?${nextParams.toString()}`);
    }
  };

  // Show "I'm Verified" screen when user arrives from email verification redirect
  if (arrivedVerified) {
    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={1} />
        <main className="container mx-auto px-4 py-10 max-w-md text-center">
          <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Email Verified!</h1>
            <p className="text-muted-foreground">
              Your email has been confirmed. Click below to continue with {tier === "wren" ? "your profile details" : "payment"}.
            </p>
            <Button
              onClick={handleContinue}
              size="lg"
              className="rounded-full px-10 text-base font-semibold"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (showVerification) {
    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={1} />
        <main className="container mx-auto px-4 py-10 max-w-md text-center">
          <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Check Your Email</h1>
            <p className="text-muted-foreground">
              We've sent a verification link to{" "}
              <span className="font-semibold text-foreground">{email}</span>.
              Please verify your email to complete enrollment.
            </p>
            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">What happens next?</p>
              <p>Once verified, click below to continue with {tier === "wren" ? "your profile details" : "payment"}.</p>
            </div>
            <Button
              onClick={handleContinue}
              size="lg"
              className="rounded-full px-10 text-base font-semibold"
            >
              I've Verified — Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Didn't receive it? Check your spam folder or try signing up again.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={1} />

      <main className="container mx-auto px-4 py-10 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Create Your Account</h1>
          <p className="text-muted-foreground">
            Setting up your <span className="font-semibold text-foreground">{tierInfo.name}</span> membership
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
            </div>
          </section>

          <div className="text-center space-y-3">
            <Button type="submit" size="lg" className="rounded-full px-10 text-base font-semibold" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {tier === "wren" ? "Create Account" : "Continue to Payment"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                 to={`/auth?returnTo=${encodeURIComponent(authReturnTo)}`}
                className="text-primary font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
