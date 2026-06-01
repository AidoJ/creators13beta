import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Blocks the app until the signed-in user has a first AND last name on their
 * profile. Shows once on /play (or wherever it's mounted) for legacy users.
 */
export function NamePrompt({ onComplete }: { onComplete?: (first: string, last: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const f = (data?.first_name ?? "").trim();
      const l = (data?.last_name ?? "").trim();
      if (!f || !l) {
        setFirst(f);
        setLast(l);
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function save() {
    if (!user) return;
    const f = first.trim();
    const l = last.trim();
    if (!f || !l) {
      toast.error("Please enter both your first and last name.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: f, last_name: l })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    onComplete?.(f, l);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Tell us your name</DialogTitle>
          <DialogDescription>
            We display your first name and last initial on the board so opponents know who's playing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="np-first">First name</Label>
            <Input id="np-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-last">Last name</Label>
            <Input id="np-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} />
          </div>
        </div>
        <div className="flex justify-end mt-2">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & continue"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
