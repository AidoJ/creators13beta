import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "creators13.play.tutorial-seen.v1";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Welcome to B Creators",
    body: "Build a honeycomb ecosystem of 16 cards — 4 Creators (one per element) + 12 matching Animals (3 per Creator) — before your opponent. You also need an empty hand of Creator cards to win.",
  },
  {
    title: "Step 1 — Pick up 2",
    body: "Each turn, draw up to 2 cards from the draw pile or the top of the Used/Discarded Pile (any combination). Your hand is capped at 8 — if you're full, skip the draw and go straight to placement.",
  },
  {
    title: "Step 2 — Play 2",
    body: "Place cards on glowing hexes next to your ecosystem, or drag a card onto the Used/Discarded Pile to discard it. Drag from your hand, or select a card and click a hex. You can end your turn early after 0 or 1 plays.",
  },
  {
    title: "Special powers",
    body: "Any Creator in hand can be played as a Disaster — it goes to the Used/Discarded Pile and wipes every matching Animal from rivals' ecosystems straight onto your board. Sky Creatures steal an Animal. Golden Hive arms a shield that absorbs one Disaster. Golden Body is a wildcard Animal.",
  },
  {
    title: "Card tips",
    body: "Tap the ⓘ on any card to flip it and read its descriptor. Click a placed hex to rotate its colours so neighbouring halves match. You can also rearrange your own placed cards between draw and play.",
  },
];

export function TutorialOverlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{s.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{s.body}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1 my-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>
        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>Skip tutorial</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>Back</Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={close}>Start playing</Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>Next</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manually re-open the tutorial (e.g. from a help button). */
export function resetTutorial() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
