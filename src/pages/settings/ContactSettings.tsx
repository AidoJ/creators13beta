/**
 * /settings/contact — Personal Contact Preferences (Batch C).
 *
 * Lives under Me → Settings (account-level), not under /settings/community.
 * Controls the master "open to contact" flag and per-channel handles that
 * are revealed only when both sides approve a connection request.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Leaf, ArrowLeft } from "lucide-react";
import type { ContactChannels } from "@/lib/contacts";

export default function ContactSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [openToContact, setOpenToContact] = useState(false);
  const [ch, setCh] = useState<ContactChannels>({});
  const [enEmail, setEnEmail] = useState(false);
  const [enPhone, setEnPhone] = useState(false);
  const [enWhats, setEnWhats] = useState(false);
  const [enMess, setEnMess] = useState(false);
  const [enTele, setEnTele] = useState(false);
  const [enOther, setEnOther] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?returnTo=/settings/contact", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("open_to_contact, contact_channels")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data) { setLoading(false); return; }
      setOpenToContact(!!(data as any).open_to_contact);
      const cc = (((data as any).contact_channels) as ContactChannels) ?? {};
      setCh(cc);
      setEnEmail(!!(cc.email && cc.email.trim().length > 0));
      setEnPhone(!!(cc.phone_number && cc.phone_number.trim().length > 0));
      setEnWhats(!!(cc.whatsapp && cc.whatsapp.trim().length > 0));
      setEnMess(!!(cc.messenger && cc.messenger.trim().length > 0));
      setEnTele(!!(cc.telegram && cc.telegram.trim().length > 0));
      setEnOther(!!(cc.other && cc.other.trim().length > 0));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (openToContact && enPhone) {
      const phoneVal = (ch.phone_number ?? "").trim();
      const digits = phoneVal.replace(/[^\d]/g, "");
      // Required so we can SMS connection-request notifications via Twilio.
      // Accept international format: 8–15 digits, optional leading + and spaces/dashes.
      const valid = /^\+?[0-9\s\-()]{8,}$/.test(phoneVal) && digits.length >= 8 && digits.length <= 15;
      if (!valid) {
        toast({
          title: "Valid phone number required",
          description: "Enter a phone number in international format (e.g. +61 400 000 000) so we can text you when someone requests to connect.",
          variant: "destructive",
        });
        return;
      }
      if (!ch.phone_call_ok && !ch.phone_sms_ok) {
        toast({
          title: "Phone needs a permission",
          description: "Tick at least one of 'OK to call' or 'OK to text (SMS)' for Phone.",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    const contactChannels: Record<string, unknown> = {
      email: enEmail ? (ch.email ?? "").trim() || null : null,
      phone_number: enPhone ? (ch.phone_number ?? "").trim() || null : null,
      phone_call_ok: enPhone ? !!ch.phone_call_ok : false,
      phone_sms_ok: enPhone ? !!ch.phone_sms_ok : false,
      whatsapp: enWhats ? (ch.whatsapp ?? "").trim() || null : null,
      messenger: enMess ? (ch.messenger ?? "").trim() || null : null,
      telegram: enTele ? (ch.telegram ?? "").trim() || null : null,
      other: enOther ? (ch.other ?? "").trim() || null : null,
    };
    const { error } = await supabase
      .from("profiles")
      .update({ open_to_contact: openToContact, contact_channels: contactChannels } as never)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contact preferences saved" });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Leaf className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Contact Preferences</h1>
          <Button variant="secondary" size="sm" className="rounded-full shadow-sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Me
          </Button>
        </div>

        <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Other Creators can request to connect with you. Your contact details are never shared
            publicly — only revealed when you approve a specific request, and only on channels
            you've both enabled.
          </p>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">I'm open to receiving connection requests</p>
              <p className="text-xs text-muted-foreground mt-1">
                Channels below stay disabled until this is on. Your entered details are preserved
                across toggles.
              </p>
            </div>
            <Switch checked={openToContact} onCheckedChange={setOpenToContact} />
          </div>

          <div className={openToContact ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_email" checked={enEmail} onCheckedChange={(v) => setEnEmail(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_email" className="cursor-pointer">Email</Label>
              </div>
              {enEmail && (
                <Input
                  type="email" placeholder="you@example.com"
                  value={ch.email ?? ""}
                  onChange={(e) => setCh((c) => ({ ...c, email: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_phone" checked={enPhone} onCheckedChange={(v) => setEnPhone(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_phone" className="cursor-pointer">Phone</Label>
              </div>
              {enPhone && (
                <div className="space-y-2 pl-6">
                  <Input
                    type="tel" placeholder="+61 400 000 000"
                    value={ch.phone_number ?? ""}
                    onChange={(e) => setCh((c) => ({ ...c, phone_number: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox id="ch_call" checked={!!ch.phone_call_ok}
                        onCheckedChange={(v) => setCh((c) => ({ ...c, phone_call_ok: !!v }))} />
                      <Label htmlFor="ch_call" className="cursor-pointer text-sm">OK to call</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="ch_sms" checked={!!ch.phone_sms_ok}
                        onCheckedChange={(v) => setCh((c) => ({ ...c, phone_sms_ok: !!v }))} />
                      <Label htmlFor="ch_sms" className="cursor-pointer text-sm">OK to text (SMS)</Label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">A valid phone number is required so we can SMS you when another Creator requests to connect. Tick at least one — others see your phone only via the permissions you grant.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_w" checked={enWhats} onCheckedChange={(v) => setEnWhats(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_w" className="cursor-pointer">WhatsApp</Label>
              </div>
              {enWhats && (
                <Input placeholder="+61 400 000 000 (can differ from Phone)"
                  value={ch.whatsapp ?? ""}
                  onChange={(e) => setCh((c) => ({ ...c, whatsapp: e.target.value }))} />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_m" checked={enMess} onCheckedChange={(v) => setEnMess(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_m" className="cursor-pointer">Messenger</Label>
              </div>
              {enMess && (
                <Input placeholder="facebook.com/yourhandle"
                  value={ch.messenger ?? ""}
                  onChange={(e) => setCh((c) => ({ ...c, messenger: e.target.value }))} />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_t" checked={enTele} onCheckedChange={(v) => setEnTele(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_t" className="cursor-pointer">Telegram</Label>
              </div>
              {enTele && (
                <Input placeholder="@yourhandle"
                  value={ch.telegram ?? ""}
                  onChange={(e) => setCh((c) => ({ ...c, telegram: e.target.value }))} />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="ch_o" checked={enOther} onCheckedChange={(v) => setEnOther(!!v)} disabled={!openToContact} />
                <Label htmlFor="ch_o" className="cursor-pointer">Other</Label>
              </div>
              {enOther && (
                <Input placeholder='e.g. "Signal: @creator"'
                  value={ch.other ?? ""}
                  onChange={(e) => setCh((c) => ({ ...c, other: e.target.value }))} />
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Leaf className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
