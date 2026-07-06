import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { getAppOrigin } from "@/lib/appOrigin";

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Reset the confirmation view whenever the dialog closes/reopens so a
  // second forgot-password request from the same session starts fresh.
  useEffect(() => {
    if (!open) {
      setSentTo(null);
      setLoading(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${getAppOrigin()}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSentTo(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {sentTo ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MailCheck className="h-5 w-5 text-primary" />
                Reset link sent
              </DialogTitle>
              <DialogDescription>
                We've emailed a password-reset link to{" "}
                <span className="font-semibold text-foreground">{sentTo}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm leading-relaxed">
              <p className="font-medium text-foreground mb-1">
                Check your inbox now — and your junk / spam folder.
              </p>
              <p className="text-muted-foreground">
                The email can take a minute or two to arrive. Click the link inside
                to set a new password. If nothing shows up after 5 minutes, try
                again or contact support.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSentTo(null)}
              >
                Send to a different email
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                We'll email you a link to set a new password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">Email</Label>
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
