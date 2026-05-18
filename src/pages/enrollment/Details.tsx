import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { TIERS, TierKey } from "@/lib/tiers";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";
import { useEnrollmentGate } from "@/hooks/useEnrollmentGate";

export default function Details() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ready: gateReady } = useEnrollmentGate();
  const { toast } = useToast();

  const tier = (params.get("tier") as TierKey) || "wren";
  const billing = params.get("billing") || "monthly";
  const paymentStatus = params.get("payment");
  const tierInfo = TIERS[tier] || TIERS.wren;

  // Determine if user just arrived from payment/signup
  const isPaymentSuccess = paymentStatus === "success" || paymentStatus === "skipped";

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(!isPaymentSuccess);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("+61 ");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [genderOther, setGenderOther] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Australia");
  const [medicalHistory, setMedicalHistory] = useState("");

  // Fetch existing profile data on mount — only once per user id, so that
  // returning to the tab (which re-fires auth state) doesn't wipe in-progress edits.
  const loadedForUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!user) { setFetching(false); return; }
    if (loadedForUserId.current === user.id) return;
    loadedForUserId.current = user.id;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, date_of_birth, gender, pronouns, height_cm, shoe_size, address_line1, address_line2, city, state, postal_code, country, medical_history")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        if (data.first_name) setFirstName(data.first_name);
        if (data.last_name) setLastName(data.last_name);
        if (data.phone) setPhone(data.phone);
        if (data.date_of_birth) setDateOfBirth(data.date_of_birth);
        const g = data.gender || "";
        if (["female", "male", "gender-diverse", "prefer-not-to-say"].includes(g)) {
          setGender(g);
        } else if (g) {
          setGender("other");
          setGenderOther(g);
        }
        if (data.pronouns) setPronouns(data.pronouns);
        if (data.height_cm != null) setHeightCm(String(data.height_cm));
        if (data.shoe_size) setShoeSize(data.shoe_size);
        if (data.address_line1) setAddressLine1(data.address_line1);
        if (data.address_line2) setAddressLine2(data.address_line2);
        if (data.city) setCity(data.city);
        if (data.state) setState(data.state);
        if (data.postal_code) setPostalCode(data.postal_code);
        if (data.country) setCountry(data.country);
        if (data.medical_history) setMedicalHistory(data.medical_history);
      }
      setFetching(false);
    };
    load();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please sign in first", variant: "destructive" });
      return;
    }
    if (!gender) {
      toast({ title: "Please select your gender", variant: "destructive" });
      return;
    }

    setLoading(true);

    const profileData = {
      user_id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      display_name: `${firstName} ${lastName}`.trim() || null,
      phone: phone || null,
      date_of_birth: dateOfBirth || null,
      gender: gender === "other" ? genderOther : (gender || null),
      pronouns: pronouns || null,
      height_cm: heightCm ? Number(heightCm) : null,
      shoe_size: shoeSize || null,
      address_line1: addressLine1 || null,
      address_line2: addressLine2 || null,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      country: country || null,
      medical_history: medicalHistory || null,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "user_id" });

    setLoading(false);

    if (error) {
      toast({ title: "Failed to save details", description: error.message, variant: "destructive" });
      return;
    }

    // Mark any pending invitation for this email as "photos_pending" — they've
    // verified login and saved their profile, but haven't uploaded photos yet.
    // The list view will promote it to "accepted" (Ready for profiling) once
    // photos are uploaded.
    if (user.email) {
      await supabase
        .from("client_invitations")
        .update({ status: "photos_pending" })
        .eq("email", user.email)
        .in("status", ["pending", "link_clicked", "account_created"]);
    }

    toast({ title: "Details saved!" });

    // If returnTo is set (editing from dashboard), go back there
    const returnTo = params.get("returnTo");
    if (returnTo) {
      navigate(returnTo);
      return;
    }

    const nextParams = new URLSearchParams({ tier, billing });
    if (params.get("case_study") === "true") nextParams.set("case_study", "true");

    // Check if this is a case study signup — route to consent first
    const isCaseStudy = params.get("case_study") === "true" || false;
    // Also check if referral_code exists in subscription (indicates case study)
    let needsConsent = isCaseStudy;
    if (!needsConsent && user) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("referral_code")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sub?.referral_code) needsConsent = true;
    }
    // Check if already consented
    if (needsConsent && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("case_study_consent_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.case_study_consent_at) needsConsent = false;
    }

    if (needsConsent) {
      navigate(`/enroll/consent?${nextParams.toString()}`);
    } else {
      navigate(`/enroll/photos?${nextParams.toString()}`);
    }
  };

  if (fetching || !gateReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show confirmation first if arriving from payment
  if (isPaymentSuccess && !showForm) {
    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={4} />
        <main className="container mx-auto px-4 py-10 max-w-md">
          <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {tier === "wren" ? "Account Created!" : "Payment Successful!"}
            </h1>
            <p className="text-muted-foreground">
              Your <span className="font-semibold text-foreground">{tierInfo.name}</span> membership is now active.
              Next, let's add your personal details.
            </p>
            <Button
              onClick={() => setShowForm(true)}
              size="lg"
              className="rounded-full px-10 text-base font-semibold"
            >
              Add My Details
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={4} />

      <main className="container mx-auto px-4 py-10 max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">Your Personal Details</h1>
          <p className="text-muted-foreground">
            These details help us with your Creator Type profiling session.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Personal Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" required value={phone} onChange={(e) => {
                        const val = e.target.value;
                        // Keep the + prefix if user tries to delete it
                        if (!val.startsWith("+")) {
                          setPhone("+" + val.replace(/^\+*/, ""));
                        } else {
                          setPhone(val);
                        }
                      }} placeholder="+61 412 293 255" />
                      <p className="text-[11px] text-muted-foreground mt-0.5">Include country code, e.g. +61 for Australia</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of Birth *</Label>
              <Input id="dob" type="date" required value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender *</Label>
              <Select value={gender} onValueChange={(v) => { setGender(v); if (v !== "other") setGenderOther(""); }} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="gender-diverse">Gender Diverse</SelectItem>
                  <SelectItem value="other">Self-describe</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {gender === "other" && (
              <div className="space-y-1.5">
                <Label htmlFor="genderOther">Please describe your gender *</Label>
                <Input id="genderOther" required value={genderOther} onChange={(e) => setGenderOther(e.target.value)} placeholder="How do you describe your gender?" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input id="pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. she/her, he/him, they/them" />
            </div>
          </section>

          {/* Physical */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Physical Details</h2>
            <p className="text-xs text-muted-foreground -mt-2">Used for body-type profiling — all data is kept confidential.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="height">Height (cm) *</Label>
                <Input id="height" type="number" required min={100} max={250} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="170" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shoe">Shoe Size (AU) *</Label>
                <Input id="shoe" required value={shoeSize} onChange={(e) => setShoeSize(e.target.value)} placeholder="8" />
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Address</h2>
            <div className="space-y-1.5">
              <Label htmlFor="addr1">Street Address</Label>
              <Input id="addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addr2">Apartment / Unit</Label>
              <Input id="addr2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Unit 4" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sydney" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="NSW" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="postal">Postal Code</Label>
                <Input id="postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="2000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">Country *</Label>
                <Input id="country" required value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Medical */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Medical History</h2>
            <p className="text-xs text-muted-foreground -mt-2">Any conditions, surgeries, or injuries that may affect your body shape or posture.</p>
            <Textarea
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="e.g. Scoliosis, knee replacement, pregnancy..."
              rows={4}
            />
          </section>

          {/* Submit */}
          <div className="text-center pb-8">
            <Button type="submit" size="lg" className="rounded-full px-10 text-base font-semibold" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Save & Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
