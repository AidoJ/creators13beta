import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  level: 1 | 2 | 3 | null;
  onClose: () => void;
}

export default function ApplyDialog({ level, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function reset() {
    setName(""); setEmail(""); setPhone(""); setMessage(""); setSent(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!level) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("submit-practitioner-application", {
      body: { name, email, phone, message, level },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({
        title: "Couldn't send your application",
        description: (data as any)?.message || error?.message || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setSent(true);
  }

  return (
    <Dialog open={!!level} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for Level {level}</DialogTitle>
          <DialogDescription>
            Every level is by application. Tell us a little about yourself and we'll be in touch about the next intake.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="text-foreground font-medium">Application sent.</p>
            <p className="text-sm text-muted-foreground">
              We've passed it on for review — you'll hear back by email.
            </p>
            <Button onClick={() => { reset(); onClose(); }}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Your name</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-email">Email</Label>
                <Input id="ap-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-phone">Phone (optional)</Label>
                <Input id="ap-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-msg">Why do you want to train?</Label>
              <Textarea
                id="ap-msg" rows={4} value={message} maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your background, and what you'd bring the Creator Types into."
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full rounded-full">
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : "Send application"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
