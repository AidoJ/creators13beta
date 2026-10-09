import { ageFromDob } from "@/lib/age";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, CalendarDays, Camera, Check, ChevronDown, ChevronUp,
  ClipboardList, Filter, Folder, FolderPlus, Gamepad2, HelpCircle,
  MapPin, Share2, Sparkles, Send, User, UserPlus, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep } from "@/lib/enrollmentSteps";
import type { OnboardingStep } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import gameIcon from "@/assets/community-icons/game-icon.png.asset.json";
import eventsIcon from "@/assets/community-icons/event-calendar-icon.png.asset.json";
import projectsIcon from "@/assets/community-icons/projects-icon.png.asset.json";
import filterIcon from "@/assets/community-icons/filter-icon.png.asset.json";
import connectIcon from "@/assets/community-icons/connect-icon.png.asset.json";

const icons = {
  camera: Camera, sparkles: Sparkles, user: User, map: MapPin, users: Users,
  filter: Filter, calendar: CalendarDays, folder: Folder, "folder-plus": FolderPlus,
  game: Gamepad2, "user-plus": UserPlus, share: Share2,
  clipboard: ClipboardList, stethoscope: Send, // legacy key; non-medical icon
};

// Steps that have a section icon elsewhere in the app use that same artwork
// (e.g. the hexagon-star Game icon from the top menu).
const imageIcons: Record<string, string> = {
  game: gameIcon.url, calendar: eventsIcon.url, folder: projectsIcon.url,
  "folder-plus": projectsIcon.url, filter: filterIcon.url, users: connectIcon.url,
};
function StepIcon({ iconKey, className }: { iconKey: string; className: string }) {
  const img = imageIcons[iconKey];
  if (img) return <img src={img} alt="" aria-hidden className={cn(className, "object-contain")} style={{ filter: "brightness(0) saturate(100%) invert(72%) sepia(43%) saturate(459%) hue-rotate(8deg) brightness(91%) contrast(86%)" }} />;
  const Icon = icons[iconKey as keyof typeof icons] ?? Sparkles;
  return <Icon className={className} />;
}
export const OPEN_GETTING_STARTED_HELP = "c13:open-getting-started-help";

type Props = { userId: string; firstName?: string | null; purchaseSuccess?: boolean };

export default function GettingStartedCard({ userId, firstName, purchaseSuccess = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [trainingLevel, setTrainingLevel] = useState<number | null>(null);
  // Once every step is done and "You're all set" has been shown, the bar is
  // retired for good; the help sheet stays reachable from the header.
  const [retired, setRetired] = useState(false);
  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener(OPEN_GETTING_STARTED_HELP, open);
    if (new URLSearchParams(window.location.search).get("help") === "getting-started") setHelpOpen(true);
    return () => window.removeEventListener(OPEN_GETTING_STARTED_HELP, open);
  }, []);

  // After paying for a training product, name the level in the welcome.
  useEffect(() => {
    if (!purchaseSuccess) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 2 * 86400000).toISOString();
      const { data } = await supabase
        .from("entitlements")
        .select("level_key, starts_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .like("level_key", "prac_l%_trainee")
        .gte("starts_at", since)
        .order("starts_at", { ascending: false })
        .limit(1);
      const m = data?.[0]?.level_key?.match(/^prac_l(\d)_trainee$/);
      if (!cancelled && m) setTrainingLevel(Number(m[1]));
    })();
    return () => { cancelled = true; };
  }, [purchaseSuccess, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data, error }, profileRes, enrollment] = await Promise.all([
        (supabase as any).rpc("get_my_onboarding"),
        supabase.from("profiles").select("date_of_birth, guardian_consent_status, guardian_verbal_confirmed_at, reached_checkout_at").eq("user_id", userId).maybeSingle(),
        loadEnrollmentState(userId).catch(() => null),
      ]);
      if (cancelled) return;
      if (error) {
        console.error("Getting started error", error);
        setLoading(false);
        return;
      }
      const rows = ((data || []) as OnboardingStep[]).map((row) => ({ ...row }));
      const journey = rows.find((row) => row.key === "profiling_journey");
      if (journey && enrollment) {
        const p = profileRes.data;
        const age = ageFromDob(p?.date_of_birth) ?? 99;
        const minorWaiting = age < 18 && p?.guardian_consent_status !== "verified";
        if (minorWaiting) {
          const waitingForEmail = p?.guardian_consent_status === "pending";
          journey.title = waitingForEmail
            ? "Waiting for your guardian to confirm"
            : "Waiting for A'Hara to confirm by phone";
          journey.description = waitingForEmail
            ? "Your guardian needs to use the confirmation link sent to their email."
            : "The email is confirmed. A'Hara will record the phone confirmation next.";
          journey.cta_label = "Waiting";
          journey.route = "";
        } else {
          // Done only on evidence (server: assigned Creator Types). Nothing
          // outstanding on the client side never ticks the step by itself.
          const next = getNextEnrollmentStep(enrollment, p?.reached_checkout_at ?? null);
          if (next && !journey.done) {
            journey.title = next.label;
            journey.description = "Your progress is saved. Continue your profiling journey.";
            journey.cta_label = "Continue";
            journey.route = next.route;
          } else if (!journey.done) {
            journey.title = "Waiting for your profiling session";
            journey.description = "Your practitioner will confirm your Creator Types after your session.";
            journey.cta_label = "Waiting";
            journey.route = "";
          }
        }
      }
      const dismissed = rows[0]?.dismissed_at;
      setCollapsed(!!dismissed);
      const everyDone = rows.length > 0 && rows.every((r) => r.done);
      if (everyDone && rows[0]?.completed_seen_at) setRetired(true);
      else if (everyDone) {
        // First time all done: show "You're all set" now, never again.
        void supabase.from("onboarding_state" as any).upsert({
          user_id: userId, completed_seen_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      }
      setSteps(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, location.key]);

  const completed = steps.filter((step) => step.done).length;
  const next = useMemo(() => steps.find((step) => !step.done), [steps]);
  const allDone = steps.length > 0 && completed === steps.length;
  const title = purchaseSuccess && trainingLevel
    ? `Welcome to Practitioner Level ${trainingLevel}${firstName ? `, ${firstName}` : ""} — here's where to start`
    : purchaseSuccess
    ? `Welcome${firstName ? `, ${firstName}` : ""} — here's how to get started`
    : "Getting started";

  const setDismissed = async (hide: boolean) => {
    setCollapsed(hide);
    await supabase.from("onboarding_state" as any).upsert({
      user_id: userId,
      dismissed_at: hide ? new Date().toISOString() : null,
    } as any, { onConflict: "user_id" });
  };

  const go = (step: OnboardingStep) => {
    let route = step.route;
    if (step.key === "profiling_journey" && step.done) route = "/dashboard#creator-profile";
    if (!route) return;
    if (step.key === "view_creator_types") void (supabase as any).rpc("mark_onboarding_visited", { _marker_key: step.key });
    const [path, hash] = route.split("#");
    const scrollToTarget = () => {
      const el = hash ? document.getElementById(hash) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (path === location.pathname || path === "") {
      if (hash) window.history.replaceState(null, "", `${location.pathname}${location.search}#${hash}`);
      scrollToTarget();
      return;
    }
    navigate(route);
    if (hash) window.setTimeout(scrollToTarget, 400);
  };

  const replayTour = async () => {
    await (supabase as any).rpc("reset_onboarding_tour");
    setHelpOpen(false);
    setTourIndex(0);
    setTourOpen(true);
  };

  const helpSheet = (
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Getting started</SheetTitle><SheetDescription>Your full checklist follows your access and progress.</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-2">
            {steps.map((step) => <button key={step.key} onClick={() => { setHelpOpen(false); go(step); }} disabled={!step.route} className="w-full flex items-center gap-3 border-b border-border py-3 text-left"><Check className={cn("h-4 w-4", step.done ? "text-primary" : "text-muted-foreground/30")} /><span className="text-sm">{step.title}</span></button>)}
          </div>
          <p className="text-sm text-muted-foreground mt-6">Need help? Contact us and we'll point you in the right direction.</p>
          <Button variant="outline" className="w-full mt-3" onClick={() => void replayTour()}>Replay the tour</Button>
        </SheetContent>
      </Sheet>
  );
  const tourDialog = (
      <Dialog open={tourOpen} onOpenChange={setTourOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{steps[tourIndex]?.title ?? "Getting started"}</DialogTitle>
            <DialogDescription>{steps[tourIndex]?.description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-banner p-5 text-banner-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide">Step {tourIndex + 1} of {steps.length}</p>
            <p className="mt-2 text-sm">Use this guide whenever you want to return to the most useful next action. Your progress is saved to your account.</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setTourOpen(false)}>Close</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={tourIndex === 0} onClick={() => setTourIndex((i) => i - 1)}>Back</Button>
              {tourIndex < steps.length - 1 ? <Button onClick={() => setTourIndex((i) => i + 1)}>Next</Button> : <Button onClick={() => setTourOpen(false)}>Finish</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );

  if (loading || steps.length === 0) return null;
  if (retired) return <>{helpSheet}{tourDialog}</>;
  if (collapsed && !allDone) {
    return (
      <div className="flex items-center gap-3 border border-border bg-card px-4 py-3 rounded-lg">
        <Check className="h-4 w-4 text-primary" />
        <p className="flex-1 text-sm font-semibold">Getting started — {completed} of {steps.length} done</p>
        <Button variant="ghost" size="sm" onClick={() => void setDismissed(false)}><ChevronDown className="h-4 w-4 mr-1" /> Show</Button>
        <Button variant="ghost" size="icon" aria-label="Getting started help" onClick={() => setHelpOpen(true)}><HelpCircle className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-primary/30">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl sm:text-2xl text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{completed} of {steps.length} done</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Getting started help" onClick={() => setHelpOpen(true)}><HelpCircle className="h-5 w-5" /></Button>
          </div>
          {/* Track uses muted (the default secondary is gold and read as "full" at 0%). */}
          <Progress value={(completed / steps.length) * 100} className="h-2 bg-muted" />

          {allDone ? (
            <div className="bg-banner text-banner-foreground border border-banner-border rounded-lg p-4 flex items-center gap-3">
              <Check className="h-6 w-6" /><p className="font-semibold">You're all set.</p>
            </div>
          ) : next ? (
            <button type="button" disabled={!next.route} onClick={() => go(next)} className="w-full text-left bg-banner text-banner-foreground border border-banner-border rounded-lg p-4 sm:p-5 flex items-center gap-4 disabled:cursor-default">
              <StepIcon iconKey={next.icon_key} className="h-7 w-7 shrink-0" />
              <span className="flex-1 min-w-0"><span className="block text-xs uppercase font-semibold">Next step</span><span className="block font-display text-lg mt-0.5">{next.title}</span><span className="block text-sm opacity-80 mt-1">{next.description}</span></span>
              {next.route ? <span className="inline-flex items-center gap-1 text-sm font-semibold">{next.cta_label}<ArrowRight className="h-4 w-4" /></span> : <span className="text-sm font-semibold">Waiting</span>}
            </button>
          ) : null}

          <div className="divide-y divide-border">
            {steps.filter((step) => step.key !== next?.key).map((step) => {
              return (
                <button key={step.key} type="button" disabled={!step.route} onClick={() => go(step)} className="w-full min-h-12 py-3 flex items-center gap-3 text-left disabled:cursor-default group">
                  <span className={cn("h-7 w-7 rounded-full border flex items-center justify-center shrink-0", step.done ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                    {step.done ? <Check className="h-4 w-4" /> : <StepIcon iconKey={step.icon_key} className="h-4 w-4" />}
                  </span>
                  <span className={cn("flex-1 text-sm", step.done ? "text-muted-foreground line-through" : "text-foreground")}>{step.title}</span>
                  {step.route && <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void setDismissed(true)}><ChevronUp className="h-4 w-4 mr-1" /> Hide for now</Button>
        </div>
      </Card>

      {helpSheet}

      {tourDialog}
    </>
  );
}
