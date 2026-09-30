import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, CalendarDays, Camera, Check, ChevronDown, ChevronUp,
  ClipboardList, Filter, Folder, FolderPlus, Gamepad2, HelpCircle,
  MapPin, Share2, Sparkles, Stethoscope, User, UserPlus, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep } from "@/lib/enrollmentSteps";
import type { OnboardingStep } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const icons = {
  camera: Camera, sparkles: Sparkles, user: User, map: MapPin, users: Users,
  filter: Filter, calendar: CalendarDays, folder: Folder, "folder-plus": FolderPlus,
  game: Gamepad2, "user-plus": UserPlus, share: Share2,
  clipboard: ClipboardList, stethoscope: Stethoscope,
};

type Props = { userId: string; firstName?: string | null; purchaseSuccess?: boolean };

export default function GettingStartedCard({ userId, firstName, purchaseSuccess = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
        const dob = p?.date_of_birth ? new Date(`${p.date_of_birth}T00:00:00`) : null;
        const now = new Date();
        let age = dob ? now.getFullYear() - dob.getFullYear() : 99;
        if (dob && (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate()))) age -= 1;
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
          const next = getNextEnrollmentStep(enrollment, p?.reached_checkout_at ?? null);
          journey.done = next === null;
          if (next) {
            journey.title = next.label;
            journey.description = "Your progress is saved. Continue your profiling journey.";
            journey.cta_label = "Continue";
            journey.route = next.route;
          }
        }
      }
      const dismissed = rows[0]?.dismissed_at;
      setCollapsed(!!dismissed);
      setSteps(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, location.key]);

  const completed = steps.filter((step) => step.done).length;
  const next = useMemo(() => steps.find((step) => !step.done), [steps]);
  const allDone = steps.length > 0 && completed === steps.length;
  const title = purchaseSuccess
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
    if (!step.route) return;
    if (step.key === "view_creator_types") void (supabase as any).rpc("mark_onboarding_visited", { _marker_key: step.key });
    navigate(step.route);
  };

  if (loading || steps.length === 0) return null;
  if (collapsed) {
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
              {purchaseSuccess && <p className="text-xs text-muted-foreground mt-1">Manage or cancel from What you have below.</p>}
              <p className="text-sm text-muted-foreground mt-1">{completed} of {steps.length} done</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Getting started help" onClick={() => setHelpOpen(true)}><HelpCircle className="h-5 w-5" /></Button>
          </div>
          <Progress value={(completed / steps.length) * 100} className="h-2" />

          {allDone ? (
            <div className="bg-banner text-banner-foreground border border-banner-border rounded-lg p-4 flex items-center gap-3">
              <Check className="h-6 w-6" /><p className="font-semibold">You're all set.</p>
            </div>
          ) : next ? (
            <button type="button" disabled={!next.route} onClick={() => go(next)} className="w-full text-left bg-banner text-banner-foreground border border-banner-border rounded-lg p-4 sm:p-5 flex items-center gap-4 disabled:cursor-default">
              {(() => { const Icon = icons[next.icon_key as keyof typeof icons] ?? Sparkles; return <Icon className="h-7 w-7 shrink-0" />; })()}
              <span className="flex-1 min-w-0"><span className="block text-xs uppercase font-semibold">Next step</span><span className="block font-display text-lg mt-0.5">{next.title}</span><span className="block text-sm opacity-80 mt-1">{next.description}</span></span>
              {next.route ? <span className="inline-flex items-center gap-1 text-sm font-semibold">{next.cta_label}<ArrowRight className="h-4 w-4" /></span> : <span className="text-sm font-semibold">Waiting</span>}
            </button>
          ) : null}

          <div className="divide-y divide-border">
            {steps.filter((step) => step.key !== next?.key).map((step) => {
              const Icon = icons[step.icon_key as keyof typeof icons] ?? Sparkles;
              return (
                <button key={step.key} type="button" disabled={!step.route} onClick={() => go(step)} className="w-full min-h-12 py-3 flex items-center gap-3 text-left disabled:cursor-default group">
                  <span className={cn("h-7 w-7 rounded-full border flex items-center justify-center shrink-0", step.done ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                    {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
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

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Getting started</SheetTitle><SheetDescription>Your full checklist follows your access and progress.</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-2">
            {steps.map((step) => <button key={step.key} onClick={() => { setHelpOpen(false); go(step); }} disabled={!step.route} className="w-full flex items-center gap-3 border-b border-border py-3 text-left"><Check className={cn("h-4 w-4", step.done ? "text-primary" : "text-muted-foreground/30")} /><span className="text-sm">{step.title}</span></button>)}
          </div>
          <p className="text-sm text-muted-foreground mt-6">Need help? Contact us and we'll point you in the right direction.</p>
          <Button variant="outline" className="w-full mt-3" disabled>Replay the tour — coming in Phase 2</Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
