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
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("+61 ");
  const [guardianEmail, setGuardianEmail] = useState("");

  // Calculate age from DOB. Returns null if DOB is blank/invalid.
  const ageFromDob = (() => {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  })();
  const isMinor = ageFromDob !== null && ageFromDob < 18;

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
        .select("first_name, last_name, phone, date_of_birth, gender, pronouns, height_cm, shoe_size, address_line1, address_line2, city, state, postal_code, country, medical_history, guardian_consent, guardian_first_name, guardian_last_name, guardian_phone, guardian_email")
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
        if (data.guardian_consent) setGuardianConsent(true);
        if (data.guardian_first_name) setGuardianFirstName(data.guardian_first_name);
        if (data.guardian_last_name) setGuardianLastName(data.guardian_last_name);
        if (data.guardian_phone) setGuardianPhone(data.guardian_phone);
        if (data.guardian_email) setGuardianEmail(data.guardian_email);
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

    if (isMinor) {
      if (!guardianConsent) {
        toast({ title: "Parent/guardian consent required", description: "Please tick the consent confirmation.", variant: "destructive" });
        return;
      }
      if (!guardianFirstName.trim() || !guardianLastName.trim()) {
        toast({ title: "Guardian name required", variant: "destructive" });
        return;
      }
      if (!/^\+\d[\d\s\-]{6,}$/.test(guardianPhone.trim())) {
        toast({ title: "Guardian phone must be in international format", description: "e.g. +61 412 345 678", variant: "destructive" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail.trim())) {
        toast({ title: "Valid guardian email required", variant: "destructive" });
        return;
      }
    }

    setLoading(true);

    // Guardian details are only written for minors. For adults we deliberately
    // leave whatever is stored untouched — a minor who turns 18 must keep the
    // consent evidence for photos taken while they were under 18.
    const guardianFields = isMinor
      ? {
          guardian_consent: guardianConsent,
          guardian_first_name: guardianFirstName.trim() || null,
          guardian_last_name: guardianLastName.trim() || null,
          guardian_phone: guardianPhone.trim() || null,
          guardian_email: guardianEmail.trim() || null,
          ...(guardianConsent ? { guardian_consent_at: new Date().toISOString() } : {}),
        }
      : {};

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
      ...guardianFields,
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

      // Clinic Profile referral: redeem the practitioner-paid invitation. This
      // grants the profiling access, links the practitioner, and is a no-op for
      // everyone else. Then let the referring practitioner know.
      const inviteToken = params.get("invite");
      const { data: redeemed } = await (supabase as any).rpc("redeem_clinic_invitation", {
        _token: inviteToken || "",
      });
      if (redeemed && (redeemed as any).ok) {
        supabase.functions.invoke("notify-clinic-signup").catch(() => {});
      }
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
    // Clinic Profile referrals carry their own context through to consent so the
    // consent screen shows clinic wording rather than case-study wording.
    const isClinicReferral = params.get("clinic") === "true";
    if (isClinicReferral) {
      nextParams.set("clinic", "true");
      const t = params.get("invite");
      if (t) nextParams.set("invite", t);
    }

    // Check if this is a case study signup — route to consent first
    const isCaseStudy = params.get("case_study") === "true" || false;
    // Also check if referral_code exists in subscription (indicates case study)
    let needsConsent = isCaseStudy || isClinicReferral;
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

          {/* Parent/Guardian consent — only shown when user is under 18 */}
          {isMinor && (
            <section className="bg-amber-500/5 border-2 border-amber-500/40 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Parent / Guardian Consent</h2>
              <p className="text-sm text-foreground leading-relaxed">
                Since you are under 18 years old, we need consent from a parent or guardian before you upload your photos.
              </p>

              <label className="flex gap-3 items-start cursor-pointer rounded-xl border border-border bg-card p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-primary"
                  checked={guardianConsent}
                  onChange={(e) => setGuardianConsent(e.target.checked)}
                  required
                />
                <span className="text-xs text-foreground leading-relaxed">
                  Yes, I confirm I have obtained consent from my parent/guardian named below and that they are aware of the following:
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>I am having body and face photos submitted as a volunteer case study or paying client of 13CREATORS</li>
                    <li>The <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={(e) => e.stopPropagation()}>privacy policy</a> that states exactly how body photos are stored, viewed and removed from this website</li>
                    <li>They can contact us for more information via <span className="text-primary">info@13creators.com</span></li>
                  </ul>
                </span>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="guardianFirstName">Guardian First Name *</Label>
                  <Input id="guardianFirstName" required={isMinor} value={guardianFirstName} onChange={(e) => setGuardianFirstName(e.target.value)} placeholder="Jane" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guardianLastName">Guardian Last Name *</Label>
                  <Input id="guardianLastName" required={isMinor} value={guardianLastName} onChange={(e) => setGuardianLastName(e.target.value)} placeholder="Smith" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guardianPhone">Guardian Phone *</Label>
                <Input
                  id="guardianPhone"
                  type="tel"
                  required={isMinor}
                  value={guardianPhone}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val.startsWith("+")) {
                      setGuardianPhone("+" + val.replace(/^\+*/, ""));
                    } else {
                      setGuardianPhone(val);
                    }
                  }}
                  placeholder="+61 412 345 678"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">Must include country code, e.g. +61 for Australia</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guardianEmail">Guardian Email *</Label>
                <Input id="guardianEmail" type="email" required={isMinor} value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} placeholder="guardian@example.com" />
              </div>
            </section>
          )}


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
