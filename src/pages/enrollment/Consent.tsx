import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";
import { useEnrollmentGate } from "@/hooks/useEnrollmentGate";

const CONSENT_ITEMS = [
  "I understand that my photos will be used for body-type profiling as part of a practitioner training case study.",
  "I consent to my anonymised profiling data being reviewed by a certified trainer for assessment purposes.",
  "I understand I can withdraw my consent and request deletion of my data at any time by contacting my practitioner.",
  "I confirm that I am over 18 years of age.",
];

export default function Consent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ready: gateReady } = useEnrollmentGate();
  const { toast } = useToast();

  const tier = params.get("tier") || "wren";
  const billing = params.get("billing") || "monthly";

  const [checked, setChecked] = useState<boolean[]>(CONSENT_ITEMS.map(() => false));
  const [loading, setLoading] = useState(false);

  const allChecked = checked.every(Boolean);

  const handleToggle = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const handleConsent = async () => {
    if (!user) {
      toast({ title: "Please sign in first", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ case_study_consent_at: new Date().toISOString() })
      .eq("user_id", user.id);

    setLoading(false);

    if (error) {
      toast({ title: "Failed to save consent", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Consent recorded" });
    const nextParams = new URLSearchParams({ tier, billing });
    if (params.get("case_study") === "true") nextParams.set("case_study", "true");
    navigate(`/enroll/photos?${nextParams.toString()}`);
  };

  if (!gateReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={5} />

      <main className="container mx-auto px-4 py-10 max-w-lg">
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Case Study Consent</h1>
          <p className="text-muted-foreground">
            Before submitting your photos, please review and agree to the following.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 mb-8">
          {CONSENT_ITEMS.map((item, i) => (
            <label
              key={i}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <Checkbox
                checked={checked[i]}
                onCheckedChange={() => handleToggle(i)}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground leading-relaxed group-hover:text-primary transition-colors">
                {item}
              </span>
            </label>
          ))}
        </div>

        <div className="text-center">
          <Button
            onClick={handleConsent}
            disabled={!allChecked || loading}
            size="lg"
            className="rounded-full px-10 text-base font-semibold"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                I Agree — Continue to Photos
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            You can withdraw consent at any time by contacting us.
          </p>
        </div>
      </main>
    </div>
  );
}
