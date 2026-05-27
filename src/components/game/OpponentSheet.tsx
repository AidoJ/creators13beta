import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Ecosystem } from "@/components/game/Ecosystem";
import type { Player } from "@/lib/game/types";

interface OpponentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: Player | null;
}

export function OpponentSheet({ open, onOpenChange, player }: OpponentSheetProps) {
  if (!player) return null;
  const placed = player.ecosystem.placed.size;
  const handCount = player.hand.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <SheetTitle className="font-display text-xl">{player.name}</SheetTitle>
          <SheetDescription>
            {placed} card{placed === 1 ? "" : "s"} placed · {handCount} in hand
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
          <Ecosystem
            eco={player.ecosystem}
            size={72}
            minHeight={420}
            showEmpties={false}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
