import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "creators13.play.tutorial-seen.v2";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Welcome to BCreators",
    body: "Build a honeycomb ecosystem of 16 cards — 4 Creators (one per element: Earth, Fire, Air, Water) + 12 matching Animals (3 per Creator). To win you must ensure that you are NOT holding any Creator Cards in your hand.",
  },
  {
    title: "Step 1 — Pick up 2",
    body: "Each turn you MUST draw 2 cards (any combination of the Draw Pile and the top of the Used Pile). Your hand is capped at 5 — you'll always end your turn holding 5 or fewer cards.",
  },
  {
    title: "Step 2 — Play 2",
    body: "You MUST take 2 placement actions every turn: place a card on a glowing hex next to your ecosystem, or drag a card onto the Used Pile to discard it. When placing an animal, every adjacent animal must share at least one Creator Type with it, and at least one neighbour (Creator or animal) must match — Creators are foundational anchors and never block placements regardless of element. Sky Creator and Golden Body are wildcards. If nothing legal fits, discard instead — you can't end your turn early or skip placements.",
  },
  {
    title: "Disasters & specials",
    body: "Once all 4 of your own Creators are on the board, any Creator in your hand can be played as a Disaster — it wipes every matching Animal from rivals straight onto your board. A Sky Creator Disaster only wipes Sky Mystical Creatures. Sky Creatures can also steal an Animal. Golden Hive sits passively in your hand and can only leave it by blocking an incoming Disaster — you choose whether to spend it when the prompt appears. Golden Body is a wildcard Animal.",
  },
  {
    title: "Free actions & tips",
    body: "Tap the ⓘ on any card to flip it and read its descriptor. Click a placed hex to rotate it (+60°) so neighbouring colours match. You may also reposition any of your placed cards to another legal empty hex — cards can move, but never leave the board.",
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
