import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Camera, X, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Loader2, Eye, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EnrollmentHeader from "@/components/enrollment/EnrollmentHeader";
import { useEnrollmentGate } from "@/hooks/useEnrollmentGate";
import { useToast } from "@/hooks/use-toast";

import guidePhoto1 from "@/assets/guide-photo-1.png";
import guidePhoto2 from "@/assets/guide-photo-2.png";
import guidePhoto3 from "@/assets/guide-photo-3.png";
import guidePhoto4 from "@/assets/guide-photo-4.png";
import guidePhoto5 from "@/assets/guide-photo-5.png";
import guidePhoto6 from "@/assets/guide-photo-6.png";
import guidePhoto7 from "@/assets/guide-photo-7.png";
import guidePhoto8 from "@/assets/guide-photo-8.png";

const PHOTO_SLOTS = [
  { key: "face_front_closed", label: "Face – Front", description: "Mouth closed, neutral expression", guide: guidePhoto1 },
  { key: "face_front_smiling", label: "Face – Smiling", description: "Smiling with teeth showing", guide: guidePhoto2 },
  { key: "face_side", label: "Face – Side Profile", description: "Clear side profile of your face", guide: guidePhoto3 },
  { key: "body_front", label: "Full Body – Front", description: "Standing naturally, facing camera", guide: guidePhoto4 },
  { key: "body_back", label: "Full Body – Back", description: "Standing naturally, back to camera", guide: guidePhoto5 },
  { key: "body_side", label: "Full Body – Side", description: "Standing naturally, side profile", guide: guidePhoto6 },
  { key: "feet", label: "Both Feet", description: "Top-down view of both feet together", guide: guidePhoto7 },
  { key: "hands", label: "Hand(s)", description: "Both hands, or one if they're similar", guide: guidePhoto8 },
] as const;

type PhotoKey = typeof PHOTO_SLOTS[number]["key"];

interface ReviewResult {
  pass: boolean;
  feedback: string;
}

interface PhotoState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
  reviewing: boolean;
  review: ReviewResult | null;
  existingPath: string | null; // Track if loaded from storage
  rawFallback: File | null; // Original file when HEIC conversion fails — uploaded as-is, admin can convert later
  skipReview: boolean; // True when AI review was skipped (e.g. HEIC fallback) — practitioner will check manually
}

const initialPhotoState: PhotoState = {
  file: null,
  preview: null,
  uploading: false,
  uploaded: false,
  error: null,
  reviewing: false,
  review: null,
  existingPath: null,
  rawFallback: null,
  skipReview: false,
};

type ViewMode = "guidelines" | "wizard" | "review";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale a large image (in-browser) to keep uploads under storage/network limits.
// Returns the original file if it's already small or if downscaling fails.
async function downscaleImage(file: File, maxEdge = 2400, quality = 0.85): Promise<File> {
  // Skip if already small enough
  if (file.size <= 3 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return file;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    const newName = file.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
    return new File([blob], newName.endsWith(".jpg") || newName.endsWith(".jpeg") ? newName : `${newName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export default function Photos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ready: gateReady } = useEnrollmentGate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("guidelines");
  const [photos, setPhotos] = useState<Record<PhotoKey, PhotoState>>(
    Object.fromEntries(PHOTO_SLOTS.map((s) => [s.key, { ...initialPhotoState }])) as Record<PhotoKey, PhotoState>
  );
  const [submitting, setSubmitting] = useState(false);
  const [caseStudyComplete, setCaseStudyComplete] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const tier = params.get("tier") || "wren";
  const billing = params.get("billing") || "monthly";

  const slot = PHOTO_SLOTS[currentStep];
  const photo = photos[slot.key];
  const completedCount = PHOTO_SLOTS.filter((s) => photos[s.key].file !== null || photos[s.key].existingPath !== null).length;
  const allPhotosSelected = completedCount === PHOTO_SLOTS.length;
  const allReviewsPassed = PHOTO_SLOTS.every((s) => photos[s.key].review?.pass === true);
  const uploadedCount = PHOTO_SLOTS.filter((s) => photos[s.key].uploaded || photos[s.key].existingPath !== null).length;

  // Guard: redirect if no practitioner assigned
  useEffect(() => {
    if (!user) return;
    const checkPractitioner = async () => {
      const { data: assignment } = await supabase
        .from("client_practitioner")
        .select("id")
        .eq("client_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (!assignment) {
        toast({ title: "Practitioner required", description: "Please select a practitioner before uploading photos.", variant: "destructive" });
        const nextParams = new URLSearchParams({ tier, billing });
        navigate(`/enroll/practitioner?${nextParams.toString()}`, { replace: true });
      }
    };
    checkPractitioner();
  }, [user, navigate, tier, billing, toast]);

  // Guard: consent is REQUIRED for everyone before uploading photos.
  // Fail-closed: if consent is missing for any reason, redirect to consent screen.
  useEffect(() => {
    if (!user) return;
    const checkConsent = async () => {
      const [{ data: sub }, { data: profile }] = await Promise.all([
        supabase.from("subscriptions").select("referral_code, tier").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("case_study_consent_at").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!profile?.case_study_consent_at) {
        const isCaseStudy =
          params.get("case_study") === "true" ||
          !!sub?.referral_code ||
          !sub?.tier ||
          sub?.tier === "wren";
        const nextParams = new URLSearchParams({ tier, billing });
        if (isCaseStudy) nextParams.set("case_study", "true");
        navigate(`/enroll/consent?${nextParams.toString()}`, { replace: true });
      }
    };
    checkConsent();
  }, [user, navigate, params, tier, billing]);

  // Load existing photos from storage on mount
  useEffect(() => {
    if (!user) { setLoadingExisting(false); return; }
    const loadExisting = async () => {
      const { data: photoRows } = await supabase
        .from("profiling_photos")
        .select("photo_type, storage_path")
        .eq("user_id", user.id);

      if (photoRows && photoRows.length > 0) {
        const updates: Partial<Record<PhotoKey, PhotoState>> = {};
        for (const row of photoRows) {
          const key = row.photo_type as PhotoKey;
          if (!PHOTO_SLOTS.find((s) => s.key === key)) continue;
          const { data: urlData } = supabase.storage.from("profiling-photos").getPublicUrl(row.storage_path);
          if (urlData?.publicUrl) {
            updates[key] = {
              ...initialPhotoState,
              preview: urlData.publicUrl,
              uploaded: true,
              existingPath: row.storage_path,
              review: { pass: true, feedback: "Previously uploaded" },
            };
          }
        }
        if (Object.keys(updates).length > 0) {
          setPhotos((p) => ({ ...p, ...updates }));
          // Skip guidelines if returning to edit
          setViewMode("wizard");
        }
      }
      setLoadingExisting(false);
    };
    loadExisting();
  }, [user]);

  const reviewPhoto = useCallback(async (key: PhotoKey, file: File) => {
    setPhotos((p) => ({ ...p, [key]: { ...p[key], reviewing: true, review: null } }));

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("review-photo", {
        body: { photo_type: key, image_base64: base64 },
      });

      if (error) throw error;

      setPhotos((p) => ({
        ...p,
        [key]: { ...p[key], reviewing: false, review: data as ReviewResult },
      }));
    } catch (err) {
      console.error("AI review error:", err);
      // On error, auto-pass so user isn't blocked
      setPhotos((p) => ({
        ...p,
        [key]: { ...p[key], reviewing: false, review: { pass: true, feedback: "Review unavailable — photo accepted." } },
      }));
    }
  }, []);

  const handleFileSelect = async (rawFile: File) => {
    const key = slot.key;

    // Detect HEIC/HEIF by extension, MIME, AND magic bytes — some phones (esp. Android
    // share-sheets / gallery apps) deliver HEIC bytes mis-labelled as image/jpeg with a
    // .jpeg extension, which slips past extension/MIME checks and uploads unviewable files.
    const extHeic = /\.(heic|heif)$/i.test(rawFile.name) || rawFile.type === "image/heic" || rawFile.type === "image/heif";
    let isHeic = extHeic;
    if (!isHeic) {
      try {
        const head = new Uint8Array(await rawFile.slice(0, 32).arrayBuffer());
        // ISO BMFF box: bytes 4..8 == "ftyp", bytes 8..12 == brand
        if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
          const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
          // Common HEIC/HEIF brand codes
          if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "heif"].includes(brand)) {
            isHeic = true;
          }
        }
      } catch {
        // ignore — fall through with isHeic = false
      }
    }

    let file = rawFile;

    if (isHeic) {
      try {
        setPhotos((p) => ({ ...p, [key]: { ...p[key], error: null, reviewing: true } }));
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: rawFile, toType: "image/jpeg", quality: 0.9 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const newName = rawFile.name.replace(/\.(heic|heif|jpe?g)$/i, ".jpg") || "photo.jpg";
        file = new File([blob], newName.endsWith(".jpg") ? newName : `${newName}.jpg`, { type: "image/jpeg" });
      } catch (e) {
        // HEIC conversion failed in browser (common on older iOS Safari, large Live Photos, low memory).
        // Accept the original HEIC bytes anyway so the user isn't blocked — admin can convert server-side later.
        console.warn("HEIC conversion failed, accepting original file:", e);
        const previewUrl = URL.createObjectURL(rawFile);
        setPhotos((p) => ({
          ...p,
          [key]: {
            ...initialPhotoState,
            file: rawFile,
            rawFallback: rawFile,
            preview: previewUrl,
            skipReview: true,
            review: { pass: true, feedback: "Photo accepted (your practitioner will check it manually)." },
          },
        }));
        return;
      }
    } else {
      // Loose image-type check — accept anything with an image-like extension OR an image/* MIME.
      // Some Android share-sheets deliver image files with empty MIME, so extension is the fallback.
      const looksLikeImage =
        rawFile.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(rawFile.name);
      if (!looksLikeImage) {
        setPhotos((p) => ({
          ...p,
          [key]: {
            ...p[key],
            error: `This file (${rawFile.name || "unknown"}) doesn't look like a photo. Please choose a JPG, PNG, or HEIC image.`,
          },
        }));
        return;
      }
    }

    // Auto-downscale large photos (modern phone cameras often produce 10–20MB files).
    try {
      file = await downscaleImage(file);
    } catch (e) {
      console.warn("Downscale failed, using original:", e);
    }

    if (file.size > 25 * 1024 * 1024) {
      // Last-resort cap. Most phone photos are well under this.
      setPhotos((p) => ({
        ...p,
        [key]: {
          ...p[key],
          error: "Image is over 25MB. Please try a different photo or save it at lower quality.",
        },
      }));
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotos((p) => ({ ...p, [key]: { ...initialPhotoState, file, preview } }));
    reviewPhoto(key, file);
  };

  const removePhoto = (key: PhotoKey) => {
    // Only revoke blob URLs, not storage URLs
    if (photos[key].preview && photos[key].preview!.startsWith("blob:")) {
      URL.revokeObjectURL(photos[key].preview!);
    }
    setPhotos((p) => ({ ...p, [key]: { ...initialPhotoState } }));
  };

  const goNext = () => {
    if (currentStep < PHOTO_SLOTS.length - 1) setCurrentStep(currentStep + 1);
  };
  const goPrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  // Block submission only when one of the 3 body photos fails AI review.
  // Face / hands / feet remain advisory.
  const hasBlockingFailures = (["body_front", "body_back", "body_side"] as PhotoKey[]).some(
    (key) => {
      const p = photos[key];
      return p?.review && p.review.pass === false;
    }
  );

  const handleSubmitAll = async () => {
    if (!user) {
      toast({ title: "Please sign in first", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    for (const s of PHOTO_SLOTS) {
      const p = photos[s.key];
      // Skip if already uploaded and no new file selected
      if (p.existingPath && !p.file) continue;
      if (!p.file || p.uploaded) continue;

      setPhotos((prev) => ({ ...prev, [s.key]: { ...prev[s.key], uploading: true, error: null } }));

      const ext = p.file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${s.key}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profiling-photos")
        .upload(path, p.file, { upsert: true });

      if (uploadError) {
        setPhotos((prev) => ({ ...prev, [s.key]: { ...prev[s.key], uploading: false, error: uploadError.message } }));
        toast({ title: `Upload failed: ${s.label}`, description: uploadError.message, variant: "destructive" });
        setSubmitting(false);
        return;
      }

      const { error: dbError } = await supabase.from("profiling_photos").upsert(
        { user_id: user.id, photo_type: s.key, storage_path: path },
        { onConflict: "user_id,photo_type" }
      );

      if (dbError) {
        setPhotos((prev) => ({ ...prev, [s.key]: { ...prev[s.key], uploading: false, error: dbError.message } }));
        toast({ title: `Save failed: ${s.label}`, description: dbError.message, variant: "destructive" });
        setSubmitting(false);
        return;
      }

      setPhotos((prev) => ({ ...prev, [s.key]: { ...prev[s.key], uploading: false, uploaded: true } }));
    }

    // Only advance enrollment_step if not already past photos_uploaded
    const { data: profileData } = await supabase
      .from("profiles")
      .select("enrollment_step")
      .eq("user_id", user.id)
      .maybeSingle();

    const STEP_ORDER = ["plan_selected", "signed_up", "payment_complete", "photos_uploaded", "booking_made", "awaiting_profiling", "complete"];
    const currentIdx = STEP_ORDER.indexOf(profileData?.enrollment_step || "plan_selected");
    const photosIdx = STEP_ORDER.indexOf("photos_uploaded");

    if (currentIdx < photosIdx) {
      await supabase.from("profiles").update({ enrollment_step: "photos_uploaded" }).eq("user_id", user.id);
    }
    toast({ title: "All photos uploaded successfully!" });

    // Notify assigned practitioner(s) in the background
    supabase.functions.invoke("notify-practitioner-photos", {
      body: { client_user_id: user.id },
    }).catch((err) => console.warn("Practitioner notification failed:", err));

    setSubmitting(false);

    const returnTo = params.get("returnTo");
    const isCaseStudy = params.get("case_study") === "true";

    if (returnTo) {
      navigate(returnTo);
    } else if (isCaseStudy) {
      // Case study subjects see a confirmation screen
      setCaseStudyComplete(true);
      setSubmitting(false);
      return;
    } else {
      // Only show booking page if client is linked to A'Hara (trainer)
      const { data: trainerLink } = await supabase
        .from("client_practitioner")
        .select("practitioner_id")
        .eq("client_id", user.id)
        .eq("active", true)
        .maybeSingle();

      // Check if assigned practitioner has the 'trainer' role (i.e. A'Hara)
      let isLinkedToTrainer = false;
      if (trainerLink?.practitioner_id) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", trainerLink.practitioner_id)
          .eq("role", "trainer");
        isLinkedToTrainer = !!(roles && roles.length > 0);
      }

      if (isLinkedToTrainer) {
        const nextParams = new URLSearchParams({ tier, billing });
        navigate(`/enroll/booking?${nextParams.toString()}`);
      } else {
        navigate("/dashboard");
      }
    }
  };

  // ─── AI REVIEW BADGE ───
  const ReviewBadge = ({ state }: { state: PhotoState }) => {
    if (state.reviewing) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1.5">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          AI reviewing...
        </div>
      );
    }
    if (!state.review) return null;
    return (
      <div className="space-y-1.5">
        <div className={cn(
          "flex items-start gap-1.5 text-xs rounded-xl px-3 py-2",
          state.review.pass
            ? "bg-forest/10 text-forest"
            : "bg-destructive/10 text-destructive"
        )}>
          {state.review.pass ? (
            <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          )}
          <span>{state.review.feedback}</span>
        </div>
        {!state.review.pass && (
          <p className="text-xs text-muted-foreground px-3">
            💡 If the photo looks correct to you, you can still proceed — the AI check is just a guide. You'll be able to submit all photos regardless.
          </p>
        )}
      </div>
    );
  };

  if (loadingExisting || !gateReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── CASE STUDY CONFIRMATION ───
  if (caseStudyComplete) {
    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={6} />
        <main className="container mx-auto px-4 py-10 max-w-lg">
          <div className="mb-6 rounded-2xl border-2 border-primary/40 bg-primary/10 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-foreground leading-relaxed">
              📬 Please check your junk folder for an email from{" "}
              <span className="text-primary">info@13creators.com</span>
            </p>
          </div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-5">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-3">
              Photos Submitted!
            </h1>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-display font-bold text-foreground">
              What Happens Now?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your trainee Practitioner will review your photos and share their feedback with you in a conversation about your Creator Types. If you haven't already, please make a time with your practitioner within the next few weeks to have this conversation.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              Thank you for volunteering to be a case study!
            </p>
          </div>

          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => navigate("/dashboard")}
              size="lg"
              className="rounded-full px-10 py-3 h-auto min-h-11 text-base font-semibold"
            >
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (viewMode === "guidelines") {
    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={6} />
        <main className="container mx-auto px-4 py-10 max-w-lg">
          <div className="text-center mb-6">
           <h1 className="text-3xl font-display font-bold text-foreground mb-3">How To Take Your Photos</h1>
            <p className="text-muted-foreground">We need 8 clear photos. Please read the guidelines below before you begin.</p>
            <a
              href="/docs/13CREATORS_Sample_Body_Photos_PDF.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2 hover:text-primary/80 mt-2"
            >
              Download Body Photo Examples
            </a>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Important Guidelines
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">•</span>
                <span><strong className="text-foreground">Ask someone to take these photos for you</strong>, rather than taking them yourself in the mirror.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">•</span>
                <span>Full body photos must show contours with <strong className="text-foreground">as much skin as possible</strong>.</span>
              </li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-5 mb-2">Please ensure:</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-forest mt-0.5 shrink-0" />Tight-fitting clothing — bathing suit, yoga wear (spine visible)</li>
              <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-forest mt-0.5 shrink-0" />No glasses on your face</li>
              <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-forest mt-0.5 shrink-0" />No shoes or socks</li>
              <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-forest mt-0.5 shrink-0" />Hair tied back, fringe clipped — forehead and ears visible</li>
              <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-forest mt-0.5 shrink-0" />No makeup, especially eyebrow pencil</li>
            </ul>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <strong>AI Photo Review</strong>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Each photo will be automatically checked by AI to ensure it meets the guidelines before submission.
            </p>
          </div>

          <div className="text-center space-y-3">
            <Button onClick={() => setViewMode("wizard")} size="lg" className="rounded-full px-10 text-base font-semibold">
              I Understand — Start Photos <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <div>
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary transition-colors"
              >
                View our Privacy Policy
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── REVIEW / COMPOSITE ───
  if (viewMode === "review") {
    const anyFailed = PHOTO_SLOTS.some((s) => photos[s.key].review && !photos[s.key].review!.pass);

    return (
      <div className="min-h-screen bg-background">
        <EnrollmentHeader currentStep={6} />
        <main className="container mx-auto px-4 py-6 max-w-4xl">
           <div className="text-center mb-6">
             <h1 className="text-2xl font-display font-bold text-foreground mb-2">Review Your Photos</h1>
           <p className="text-sm text-muted-foreground">
                {anyFailed
                  ? "Some photos have AI suggestions below. The AI review is only a guide — if the photos look right to you, go ahead and submit."
                  : "All photos look good! Check the layout below and submit when ready."}
              </p>
           </div>

          {/* Composite layout */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-6">
            <div className="grid grid-cols-6 gap-2">
              {/* Face photos */}
              {(["face_front_closed", "face_front_smiling", "face_side"] as PhotoKey[]).map((key) => {
                const s = PHOTO_SLOTS.find((x) => x.key === key)!;
                const p = photos[key];
                return (
                  <div key={key} className="relative aspect-square rounded-lg overflow-hidden bg-muted/30">
                    <img src={p.preview!} alt={s.label} className="w-full h-full object-cover" />
                    {p.review && !p.review.pass && (
                      <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                        <XCircle className="h-6 w-6 text-destructive" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { removePhoto(key); setViewMode("wizard"); setCurrentStep(PHOTO_SLOTS.findIndex((x) => x.key === key)); }}
                      className="absolute top-1 right-1 bg-foreground/60 text-white rounded-full p-0.5 hover:bg-foreground/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-foreground/50 text-white text-[8px] text-center py-0.5">{s.label}</span>
                  </div>
                );
              })}

              {/* Body photos - tall */}
              {(["body_front", "body_side", "body_back"] as PhotoKey[]).map((key) => {
                const s = PHOTO_SLOTS.find((x) => x.key === key)!;
                const p = photos[key];
                return (
                  <div key={key} className="relative row-span-2 rounded-lg overflow-hidden bg-muted/30">
                    <img src={p.preview!} alt={s.label} className="w-full h-full object-cover" />
                    {p.review && !p.review.pass && (
                      <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                        <XCircle className="h-6 w-6 text-destructive" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { removePhoto(key); setViewMode("wizard"); setCurrentStep(PHOTO_SLOTS.findIndex((x) => x.key === key)); }}
                      className="absolute top-1 right-1 bg-foreground/60 text-white rounded-full p-0.5 hover:bg-foreground/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-foreground/50 text-white text-[8px] text-center py-0.5">{s.label}</span>
                  </div>
                );
              })}

              {/* Feet + hands */}
              {(["feet", "hands"] as PhotoKey[]).map((key) => {
                const s = PHOTO_SLOTS.find((x) => x.key === key)!;
                const p = photos[key];
                return (
                  <div key={key} className="relative aspect-square rounded-lg overflow-hidden bg-muted/30">
                    <img src={p.preview!} alt={s.label} className="w-full h-full object-cover" />
                    {p.review && !p.review.pass && (
                      <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                        <XCircle className="h-6 w-6 text-destructive" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { removePhoto(key); setViewMode("wizard"); setCurrentStep(PHOTO_SLOTS.findIndex((x) => x.key === key)); }}
                      className="absolute top-1 right-1 bg-foreground/60 text-white rounded-full p-0.5 hover:bg-foreground/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-foreground/50 text-white text-[8px] text-center py-0.5">{s.label}</span>
                  </div>
                );
              })}
              <div />
            </div>
          </div>

          {/* Per-photo feedback list */}
          {anyFailed && (
            <div className="space-y-2 mb-6">
              {PHOTO_SLOTS.filter((s) => photos[s.key].review && !photos[s.key].review!.pass).map((s) => (
                <div key={s.key} className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">{s.label}: </span>
                    <span className="text-sm text-muted-foreground">{photos[s.key].review!.feedback}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto shrink-0 text-xs"
                    onClick={() => { removePhoto(s.key); setViewMode("wizard"); setCurrentStep(PHOTO_SLOTS.findIndex((x) => x.key === s.key)); }}
                  >
                    Re-take
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Actions - sticky on mobile */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border py-4 -mx-4 px-4 flex items-center gap-3 justify-center z-10">
            <Button variant="outline" onClick={() => setViewMode("wizard")} className="rounded-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Edit Photos
            </Button>
            <Button
              onClick={handleSubmitAll}
              disabled={submitting || hasBlockingFailures}
              className="rounded-full px-8"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading {uploadedCount}/{PHOTO_SLOTS.length}...</>
              ) : hasBlockingFailures ? (
                <>Fix Flagged Photos First</>
              ) : (
                <>Submit All Photos <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ─── WIZARD ───
  return (
    <div className="min-h-screen bg-background">
      <EnrollmentHeader currentStep={6} />

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Photo {currentStep + 1} of {PHOTO_SLOTS.length}</span>
            <span className="text-sm text-muted-foreground">{completedCount} / {PHOTO_SLOTS.length} added</span>
          </div>
          <div className="flex gap-1">
            {PHOTO_SLOTS.map((s, i) => {
              const p = photos[s.key];
              const color = i === currentStep
                ? "bg-primary"
                : p.review?.pass === true
                ? "bg-forest/60"
                : p.review?.pass === false
                ? "bg-destructive/60"
                : p.file
                ? "bg-primary/30"
                : "bg-muted";
              return (
                <button key={s.key} onClick={() => setCurrentStep(i)} className={cn("h-2 flex-1 rounded-full transition-all", color)} />
              );
            })}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-display font-bold text-foreground text-center mb-1">
          {currentStep + 1}. {slot.label}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-5">{slot.description}</p>

        {/* Guide vs Upload */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground mb-1.5 text-center uppercase tracking-wide">Example</span>
            <div className="rounded-xl border border-border overflow-hidden bg-muted/20 h-[55vh] max-h-[480px] min-h-[240px] flex items-center justify-center">
              <img src={slot.guide} alt={`Guide: ${slot.label}`} className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground mb-1.5 text-center uppercase tracking-wide">Your Photo</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all h-[55vh] max-h-[480px] min-h-[240px]",
                photo.preview ? "border-primary/40" : "border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50",
                photo.error && "border-destructive/60"
              )}
            >
              {photo.preview ? (
                <>
                  <img src={photo.preview} alt={slot.label} className="absolute inset-0 w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removePhoto(slot.key); }}
                    className="absolute top-2 left-2 bg-foreground/60 text-white rounded-full p-1 hover:bg-foreground/80"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-xs text-muted-foreground font-medium">Tap to upload photo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Take Photo button */}
        {!photo.preview && (
          <div className="flex justify-center mb-4">
            <Button
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className="rounded-full gap-2"
            >
              <Camera className="h-4 w-4" />
              Take Photo with Camera
            </Button>
          </div>
        )}

        {/* AI Review feedback */}
        <div className="mb-4">
          <ReviewBadge state={photo} />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />

        {photo.error && <p className="text-sm text-destructive text-center mb-4">{photo.error}</p>}

        {/* Navigation - sticky on mobile */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border py-4 -mx-4 px-4 flex items-center gap-3 z-10">
          <Button variant="outline" onClick={goPrev} disabled={currentStep === 0} className="rounded-full flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
          </Button>

          {currentStep < PHOTO_SLOTS.length - 1 ? (
            <Button onClick={goNext} className="rounded-full flex-1">
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setViewMode("review")}
              disabled={!allPhotosSelected}
              className="rounded-full flex-1"
            >
              <Eye className="mr-2 h-4 w-4" /> Review All
            </Button>
          )}
        </div>

        {/* Thumbnail strip */}
        <div className="flex gap-1.5 justify-center mt-6">
          {PHOTO_SLOTS.map((s, i) => {
            const p = photos[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "w-9 h-9 rounded-lg overflow-hidden border-2 transition-all relative",
                  i === currentStep ? "border-primary" : "border-transparent",
                  !p.file && "bg-muted/40"
                )}
              >
                {p.preview ? (
                  <>
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    {p.review?.pass === false && (
                      <div className="absolute inset-0 bg-destructive/30 flex items-center justify-center">
                        <XCircle className="h-3 w-3 text-destructive" />
                      </div>
                    )}
                    {p.review?.pass === true && (
                      <div className="absolute bottom-0 right-0 bg-forest text-white rounded-tl-md p-px">
                        <CheckCircle className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground flex items-center justify-center h-full">{i + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
