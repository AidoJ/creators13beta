import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Copy, CheckCircle, Send, Loader2, Mail } from "lucide-react";
import { getAppOrigin } from "@/lib/appOrigin";
import {
  getInvitationStatusLabel,
  getInvitationStatusClass,
  resolveInvitationStatuses,
} from "@/lib/invitationStatus";

interface Invitation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  invite_token: string;
  created_at: string;
}

interface InviteClientFormProps {
  practitionerCode: string | null;
}

export default function InviteClientForm({ practitionerCode }: InviteClientFormProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchInvitations();
    fetchTemplate();
  }, [user]);

  async function fetchTemplate() {
    const { data } = await supabase
      .from("email_templates")
      .select("html_body")
      .eq("template_key", "case_study_invite")
      .single();
    if (data) setTemplateHtml(data.html_body);
  }

  const previewHtml = useMemo(() => {
    if (!templateHtml) return null;
    return templateHtml
      .replace(/\{\{clientName\}\}/g, "there")
      .replace(/\{\{inviteLink\}\}/g, "#")
      .replace(/\{\{practitionerCode\}\}/g, practitionerCode || "");
  }, [templateHtml, practitionerCode]);

  async function fetchInvitations() {
    const { data } = await supabase
      .from("client_invitations")
      .select("*")
      .eq("practitioner_id", user!.id)
      .order("created_at", { ascending: false });
    if (data) {
      const resolved = await resolveInvitationStatuses(data as Invitation[]);
      setInvitations(resolved);
    }
  }

  function getInviteLink(token: string) {
    const base = getAppOrigin();
    const params = new URLSearchParams({
      tier: "wren",
      billing: "monthly",
      case_study: "true",
      practitioner_code: practitionerCode || "",
      invite: token,
    });
    return `${base}/enroll?${params.toString()}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !practitionerCode) return;

    setLoading(true);
    const { data, error } = await supabase.from("client_invitations").insert({
      practitioner_id: user.id,
      name,
      email,
      phone: phone || null,
    }).select().single();

    if (error) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Send rich HTML email via Resend edge function
    if (data) {
      const inv = data as Invitation;
      const inviteLink = getInviteLink(inv.invite_token);
      const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
        body: { to: inv.email, clientName: inv.name, inviteLink, practitionerCode: practitionerCode || "" },
      });

      if (emailError) {
        console.error("Email send error:", emailError);
        toast({ title: "Invitation created", description: `Saved but email delivery failed. You can resend or copy the link.`, variant: "destructive" });
      } else {
        toast({ title: "Invitation sent!", description: `A beautifully formatted email has been sent to ${name}.` });
      }
    }

    setLoading(false);
    setName("");
    setEmail("");
    setPhone("");
    fetchInvitations();
  }


  function handleCopyLink(inv: Invitation) {
    const link = getInviteLink(inv.invite_token);
    navigator.clipboard.writeText(link);
    setCopiedId(inv.id);
    toast({ title: "Link copied!", description: "Share this link with your client." });
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleEmailLink(inv: Invitation) {
    const inviteLink = getInviteLink(inv.invite_token);
    const { error } = await supabase.functions.invoke("send-invite-email", {
      body: { to: inv.email, clientName: inv.name, inviteLink, practitionerCode: practitionerCode || "" },
    });
    if (error) {
      toast({ title: "Email failed", description: "Could not resend. Try copying the link instead.", variant: "destructive" });
    } else {
      toast({ title: "Email resent!", description: `Invitation re-sent to ${inv.email}.` });
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Dynamic email template preview ── */}
      {previewHtml ? (
        <div className="rounded-2xl overflow-hidden border border-secondary/30 shadow-lg">
          <div className="relative bg-gradient-to-br from-primary via-primary/90 to-secondary px-8 py-6 text-center overflow-hidden">
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-secondary/20 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70 mb-1">
              Email Preview
            </p>
            <h2 className="relative text-xl font-display font-bold text-primary-foreground leading-tight">
              Case Study Invitation
            </h2>
          </div>
          <div className="bg-card">
            <iframe
              srcDoc={previewHtml}
              className="w-full border-0"
              style={{ minHeight: 600 }}
              title="Invitation email preview"
              sandbox="allow-same-origin"
              onLoad={(e) => {
                const iframe = e.target as HTMLIFrameElement;
                if (iframe.contentDocument?.body) {
                  iframe.style.height = iframe.contentDocument.body.scrollHeight + 20 + "px";
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
          Loading invitation template…
        </div>
      )}

      {/* ── Invite form ── */}
      {practitionerCode ? (
        <>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <UserPlus className="h-4 w-4 text-primary" />
              Create a Client Invitation
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Fill in the details below to generate a personalised invite link for your case study client.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 400 000 000" />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={loading || !name || !email}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Create Invitation</>}
              </Button>
            </form>
          </div>

          {/* Invitation list */}
          {invitations.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Sent Invitations
                  <span className="text-muted-foreground font-normal ml-auto">{invitations.length}</span>
                </h3>
              </div>
              <div className="divide-y divide-border">
                {invitations.map((inv) => (
                  <div key={inv.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{inv.email} {inv.phone ? `• ${inv.phone}` : ""}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] flex-shrink-0 ${getInvitationStatusClass(inv.status)}`}
                    >
                      {getInvitationStatusLabel(inv.status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => handleCopyLink(inv)}
                      title="Copy invite link"
                    >
                      {copiedId === inv.id ? <CheckCircle className="h-3.5 w-3.5 text-forest" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => handleEmailLink(inv)}
                      title="Email invite link"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
          You need a practitioner code to invite clients. Contact your trainer.
        </div>
      )}
    </div>
  );
}
