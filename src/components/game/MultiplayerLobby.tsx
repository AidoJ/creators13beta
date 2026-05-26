import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { inviteUrl } from "@/lib/game/persistence";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when host clicks "Create" — returns the new match id + invite token. */
  onCreate: () => Promise<{ matchId: string; token: string }>;
  /** True once the guest has joined; the dialog then offers "Open match". */
  onOpenMatch?: (matchId: string) => void;
}

export function MultiplayerLobby({ open, onOpenChange, onCreate, onOpenMatch }: Props) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ matchId: string; token: string } | null>(null);

  const reset = () => {
    setCreated(null);
    setBusy(false);
  };

  const handleCreate = async () => {
    setBusy(true);
    try {
      const result = await onCreate();
      setCreated(result);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create match");
    } finally {
      setBusy(false);
    }
  };

  const url = created ? inviteUrl(created.token) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Multiplayer match</DialogTitle>
          <DialogDescription>
            {created
              ? "Send this link to a friend. The match starts the moment they open it."
              : "Create a private match and share the invite link with a friend."}
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="flex flex-col gap-3 py-2">
            <Button onClick={handleCreate} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create invite link
            </Button>
            <p className="text-xs text-muted-foreground">
              You'll be the host. Your friend will need a Creators13 account to join.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex gap-2">
              <Input value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="icon"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  toast.success("Invite link copied");
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Keep this dialog open if you like — we'll let you know when they join.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={() => onOpenMatch?.(created.matchId)}>Open match</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
