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
import { Loader2, CheckCircle2, BookOpen } from "lucide-react";
import { APPLICATION_QUESTIONS } from "@/lib/prospectus";

interface Props {
  /** 1 = Level 1 application; 2 = register interest in Level 2/3. */
  level: 1 | 2 | 3 | null;
  onClose: () => void;
}

export default function ApplyDialog({ level, onClose }: Props) {
  const isApply = level === 1;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneOk, setPhoneOk] = useState(false);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function reset() {
    setName(""); setEmail(""); setPhone(""); setMessage(""); setAnswers(["", "", "", ""]); setSent(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!level) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("submit-practitioner-application", {
      body: { name, email, phone, message, level, answers: isApply ? answers : undefined },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({
        title: isApply ? "Couldn't send your application" : "Couldn't send your message",
        description: (data as any)?.message || error?.message || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setSent(true);
  }

  return (
    <Dialog open={!!level} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isApply ? "Apply for Level 1" : "Register interest in Level 2/3"}</DialogTitle>
          <DialogDescription>
            {sent
              ? "Your application has been received."
              : isApply
                ? "Please read the Practitioner Prospectus first, then answer the four application questions below."
                : "Levels 2 and 3 are open by application to those who have completed the previous level. Let us know you're interested and we'll be in touch."}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="text-foreground font-medium">{isApply ? "Application sent." : "Thanks — we've got it."}</p>
            <p className="text-sm text-muted-foreground">
              {isApply ? "A'Hara will be in touch to arrange a call before your application is accepted." : "You'll hear back by email."}
            </p>
            <Button onClick={() => { reset(); onClose(); }}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {isApply && (
              <a href="/prospectus" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-medium text-primary hover:underline">
                <BookOpen className="h-4 w-4" /> Read the Practitioner Prospectus (opens in a new tab)
              </a>
            )}
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
                <Label htmlFor="ap-phone">{isApply ? "Phone" : "Phone (optional)"}</Label>
                <PhoneInput id="ap-phone" value={phone} onChange={(v, ok) => { setPhone(v); setPhoneOk(ok); }} required={isApply} />
              </div>
            </div>
            {isApply ? (
              APPLICATION_QUESTIONS.map((q, i) => (
                <div key={i} className="space-y-1.5">
                  <Label htmlFor={`ap-q${i}`}>{i + 1}. {q}</Label>
                  <Textarea
                    id={`ap-q${i}`} rows={3} required maxLength={2000} value={answers[i]}
                    onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                </div>
              ))
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="ap-msg">Message (optional)</Label>
                <Textarea id="ap-msg" rows={4} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full rounded-full">
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : isApply ? "Send application" : "Register interest"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
