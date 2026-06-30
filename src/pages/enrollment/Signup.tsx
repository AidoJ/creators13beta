import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, MailCheck } from "lucide-react";
import { TIERS, TierKey } from "@/lib/tiers";
import { getAppOrigin } from "@/lib/appOrigin";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";
import { SignupFields } from "@/components/auth/SignupFields";

export default function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const tier = (params.get("tier") as TierKey) || "wren";
  const billing = params.get("billing") || "monthly";
  const caseStudy = params.get("case_study") === "true";
  const isPlayer = params.get("path") === "player";
  const practitionerCode = params.get("practitioner_code") || "";
  const inviteToken = params.get("invite") || "";
  const tierInfo = TIERS[tier] || TIERS.wren;
  const authReturnParams = new URLSearchParams({ tier, billing });
  if (caseStudy) {
    authReturnParams.set("case_study", "true");
    authReturnParams.set("practitioner_code", practitionerCode);
    if (inviteToken) authReturnParams.set("invite", inviteToken);
  }
  if (isPlayer) authReturnParams.set("path", "player");
  const authReturnTo = isPlayer
    ? `/dashboard`
    : tier === "wren"
      ? `/enroll?${authReturnParams.toString()}`
      : `/enroll/payment?${authReturnParams.toString()}`;

  const [loading, setLoading] = useState(false);
  const [createdUserId, setCreatedUserId] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [showVerification, setShowVerification] = useState(false);
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

  async function handleSignup(values: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    setLoading(true);
    const appOrigin = getAppOrigin();
    const verifyParams = new URLSearchParams({ tier, billing });
    if (caseStudy) {
      verifyParams.set("case_study", "true");
      verifyParams.set("practitioner_code", practitionerCode);
      if (inviteToken) verifyParams.set("invite", inviteToken);
    }
    if (isPlayer) verifyParams.set("path", "player");
    const redirectUrl = `${appOrigin}/enroll/signup?${verifyParams.toString()}`;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { first_name: values.firstName, last_name: values.lastName },
      },
    });
    if (authError) {
      setLoading(false);
      toast({ title: "Signup failed", description: authError.message, variant: "destructive" });
      return;
    }
    const userId = authData.user?.id;
    if (!userId) {
      setLoading(false);
      toast({ title: "Signup failed", description: "No user ID returned", variant: "destructive" });
      return;
    }
    setCreatedUserId(userId);
    setCreatedEmail(values.email);

    // Upsert profile with all five fields. onConflict=user_id makes this
    // insert-or-update regardless of whether the auto-create trigger fired.
    const refCode = (params.get("ref") || "").trim();
    let invitedBy: string | null = null;
    if (refCode) {
      const { data: refUser } = await supabase.rpc("resolve_invitation_code", { _code: refCode });
      if (refUser) invitedBy = refUser as unknown as string;
    }
    const profilePatch: Record<string, unknown> = {
      user_id: userId,
      first_name: values.firstName,
      last_name: values.lastName,
      phone: values.phone,
      email: values.email,
    };
    if (invitedBy) profilePatch.invited_by_user_id = invitedBy;
    await supabase.from("profiles").upsert(profilePatch as never, { onConflict: "user_id" });

    // Create subscription/role records via edge function (handles all paths).
    const priceId = tierInfo.stripe?.price_id || null;
    const { error: fnError } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        email: values.email,
        user_id: userId,
        tier,
        billing,
        practitioner_code: practitionerCode || null,
        invite_token: inviteToken || null,
        signup_path: isPlayer ? "player" : caseStudy ? "case_study" : "paying",
        successUrl: `${appOrigin}/enroll/practitioner?tier=${tier}&billing=${billing}&payment=skipped`,
        cancelUrl: `${appOrigin}/enroll/payment?tier=${tier}&billing=${billing}&canceled=true`,
      },
    });
    if (fnError) console.error("Edge function error:", fnError);

    if (caseStudy) {
      const returnToPath = `/enroll/practitioner?tier=${tier}&billing=${billing}&case_study=true&practitioner_code=${encodeURIComponent(practitionerCode)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""}`;
      const loginUrl = `${appOrigin}/auth?returnTo=${encodeURIComponent(returnToPath)}`;
      const photosUrl = `${appOrigin}/enroll/photos?tier=${tier}&billing=${billing}&case_study=true&practitioner_code=${practitionerCode}`;
      supabase.functions.invoke("send-case-study-welcome", {
        body: {
          to: values.email,
          clientName: values.firstName || values.email.split("@")[0],
          loginLink: loginUrl,
          photosLink: photosUrl,
          practitionerCode: practitionerCode || "",
        },
      }).then(({ error: emailErr }) => {
        if (emailErr) console.error("Welcome email error:", emailErr);
      });
    }

    setLoading(false);

    if (authData.session || authData.user?.email_confirmed_at) {
      if (isPlayer) {
        navigate("/dashboard");
        return;
      }
      const nextParams = new URLSearchParams({ tier, billing });
      nextParams.set("uid", userId);
      nextParams.set("email", values.email);
      if (caseStudy) {
        nextParams.set("case_study", "true");
        nextParams.set("practitioner_code", practitionerCode);
        if (inviteToken) nextParams.set("invite", inviteToken);
      }
      navigate(tier === "wren" ? `/enroll/practitioner?${nextParams.toString()}` : `/enroll/payment?${nextParams.toString()}`);
      return;
    }
    setShowVerification(true);
  }

  const handleContinue = () => {
    if (isPlayer) {
      navigate("/dashboard");
      return;
    }
    const nextParams = new URLSearchParams({ tier, billing });
    if (createdUserId) nextParams.set("uid", createdUserId);
    else if (user) nextParams.set("uid", user.id);
    if (createdEmail) nextParams.set("email", createdEmail);
    else if (user?.email) nextParams.set("email", user.email);
    if (caseStudy) {
      nextParams.set("case_study", "true");
      nextParams.set("practitioner_code", practitionerCode);
      if (inviteToken) nextParams.set("invite", inviteToken);
    }
    navigate(tier === "wren" ? `/enroll/practitioner?${nextParams.toString()}` : `/enroll/payment?${nextParams.toString()}`);
  };

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
              Your email has been confirmed. Click below to {isPlayer ? "start playing" : tier === "wren" ? "continue with your profile details" : "continue with payment"}.
            </p>
            <Button onClick={handleContinue} size="lg" className="rounded-full px-10 text-base font-semibold">
              Continue <ArrowRight className="ml-2 h-4 w-4" />
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
              <span className="font-semibold text-foreground">{createdEmail}</span>. Please verify your email to complete enrollment.
            </p>
            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">What happens next?</p>
              <p>Once verified, click below to {isPlayer ? "jump into the game" : tier === "wren" ? "continue with your profile details" : "continue with payment"}.</p>
            </div>
            <Button onClick={handleContinue} size="lg" className="rounded-full px-10 text-base font-semibold">
              I've Verified — Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Didn't receive it? Check your spam folder or try signing up again.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const submitLabel = isPlayer
    ? "Create Account & Play"
    : tier === "wren"
      ? "Create Account"
      : "Continue to Payment";

  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={1} />
      <main className="container mx-auto px-4 py-10 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Create Your Account</h1>
          <p className="text-muted-foreground">
            {isPlayer ? "Set up your free player account" : <>Setting up your <span className="font-semibold text-foreground">{tierInfo.name}</span> membership</>}
          </p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-6">
          <SignupFields loading={loading} submitLabel={submitLabel} onSubmit={handleSignup} />
        </section>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to={`/auth?returnTo=${encodeURIComponent(authReturnTo)}`} className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
