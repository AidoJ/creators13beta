import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Save, Eye, EyeOff, RefreshCw, Copy, Palette } from "lucide-react";

/** Logo-derived colour palette for consistent email branding */
const EMAIL_PALETTE = [
  { name: "Magenta (Primary)", hex: "#BB1B56", usage: "Buttons, headings, links" },
  { name: "Gold", hex: "#C8922A", usage: "Accents, highlights, borders" },
  { name: "Ocean Blue", hex: "#2B6CB0", usage: "Secondary buttons, links" },
  { name: "Forest Green", hex: "#3D8B37", usage: "Success states, accents" },
  { name: "Terracotta", hex: "#D4652A", usage: "Warm accents, icons" },
  { name: "Earth Brown", hex: "#5A3A28", usage: "Dark text, headings" },
  { name: "Cream (Page BG)", hex: "#FDF6F0", usage: "Email body background" },
  { name: "Warm Linen (Section BG)", hex: "#FAF7F4", usage: "Section backgrounds" },
  { name: "Sand Border", hex: "#E8DDD4", usage: "Dividers, card borders" },
  { name: "Body Text", hex: "#555555", usage: "Paragraph text" },
  { name: "Muted Text", hex: "#8B6F5E", usage: "Captions, footers" },
  { name: "White", hex: "#FFFFFF", usage: "Card backgrounds, button text" },
] as const;

const LOGO_URL = "https://iifgrxnkiejfvltzlvkd.supabase.co/storage/v1/object/public/email-assets/13creators-logo.png";

const BRANDED_FOOTER_HTML = `<!-- 13 Creators Branded Footer -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-top:2px solid #E8DDD4;">
  <tr><td style="padding:28px 24px;text-align:center;background:#FAF7F4;">
    <a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
      <img src="${LOGO_URL}" alt="13 Creators" width="48" height="48" style="display:inline-block;width:48px;height:auto;border:0;" />
    </a>
    <p style="margin:12px 0 0 0;font-size:13px;color:#5A3A28;font-family:'Questrial',Arial,sans-serif;">
      Create &amp; Come Alive with Creator Types
    </p>
    <p style="margin:10px 0 0 0;">
      <a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer"
        style="font-size:12px;color:#BB1B56;text-decoration:none;font-weight:600;font-family:'Questrial',Arial,sans-serif;">
        www.13creators.com
      </a>
    </p>
    <p style="margin:16px 0 0 0;font-size:11px;color:#8B6F5E;font-family:'Questrial',Arial,sans-serif;">
      &copy; ${new Date().getFullYear()} 13 Creators &middot; All rights reserved
    </p>
  </td></tr>
</table>`;

interface EmailTemplate {
  id: string;
  template_key: string;
  subject: string;
  html_body: string;
  description: string | null;
  updated_at: string;
}

export default function EmailTemplateEditor() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("template_key");
    if (error) {
      toast({ title: "Error loading templates", description: error.message, variant: "destructive" });
    } else {
      setTemplates(data || []);
      if (data && data.length > 0 && !selected) {
        selectTemplate(data[0]);
      }
    }
    setLoading(false);
  };

  const selectTemplate = (t: EmailTemplate) => {
    setSelected(t);
    setSubject(t.subject);
    setHtmlBody(t.html_body);
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_templates")
      .update({ subject, html_body: htmlBody, updated_at: new Date().toISOString() })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template saved" });
      fetchTemplates();
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Preview replacements for all known template variables
  const previewReplacements: Record<string, string> = {
    clientName: "Jane Doe",
    inviteLink: "https://creatortypes.com/enroll?example=true",
    firstName: "Sarah",
    title: "Weekly Training Session",
    description: '<p style="color:#666;font-size:14px;margin:0 0 8px 0;">Reviewing body profiling techniques and case study submissions.</p>',
    localTime: "Wednesday, 26 February 2026, 10:00 AM",
    durationMinutes: "60",
    timezone: "Australia/Sydney",
    recurrenceText: '<p style="color:#666;font-size:13px;margin:0 0 16px 0;">🔁 This is a <strong>weekly</strong> recurring call.</p>',
    zoomButton: '<div style="text-align:center;margin:24px 0 0 0;"><a href="#" style="display:inline-block;background:#BB1B56;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Join Zoom Meeting →</a></div>',
    email: "sarah@example.com",
    practitionerName: "Sarah Johnson",
    caseStudyTitle: "Assessment for Jane Doe on 2026-03-12",
    viewLink: "https://creators13.lovable.app/trainer",
    photosLink: "https://creators13.lovable.app/enroll/photos",
    loginLink: "https://creators13.lovable.app/auth",
  };
  let previewHtml = htmlBody;
  for (const [key, value] of Object.entries(previewReplacements)) {
    previewHtml = previewHtml.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  if (loading) return <p className="text-muted-foreground text-sm py-4">Loading templates…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Email Templates</h3>
        <Button variant="outline" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No email templates found.</p>
      ) : (
        <>
          {/* Template selector */}
          {templates.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {templates.map(t => (
                <Button
                  key={t.id}
                  variant={selected?.id === t.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => selectTemplate(t)}
                >
                  {t.template_key.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              {selected.description && (
                <p className="text-xs text-muted-foreground">{selected.description}</p>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Subject Line</label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} />
              </div>

              {/* Colour Palette Reference */}
              <details className="border border-border rounded-lg">
                <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer text-sm font-medium text-foreground select-none">
                  <Palette className="h-3.5 w-3.5 text-primary" /> Brand Colour Palette
                </summary>
                <div className="px-3 pb-3 pt-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {EMAIL_PALETTE.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted/50 transition-colors group"
                        onClick={() => {
                          navigator.clipboard.writeText(c.hex);
                          toast({ title: `Copied ${c.hex}`, description: c.name });
                        }}
                        title={`Click to copy ${c.hex}`}
                      >
                        <span
                          className="h-5 w-5 rounded border border-border flex-shrink-0"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[10px] font-medium text-foreground truncate">{c.name}</span>
                          <span className="block text-[9px] text-muted-foreground font-mono">{c.hex}</span>
                        </span>
                        <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 ml-auto" />
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Click any swatch to copy its hex code. Use these colours in your email HTML for consistent branding.</p>
                  <div className="mt-3 pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(BRANDED_FOOTER_HTML);
                        toast({ title: "Footer HTML copied", description: "Paste it at the end of your email template." });
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy Branded Footer HTML
                    </Button>
                  </div>
                </div>
              </details>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Email HTML</label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                      {showPreview ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                      {showPreview ? "Edit" : "Preview"}
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {selected.description || "Available placeholders shown in the template description above."}
                </p>

                {showPreview ? (
                  <div className="border border-border rounded-xl overflow-hidden bg-white">
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full min-h-[600px] border-0"
                      title="Email Preview"
                      sandbox=""
                    />
                  </div>
                ) : (
                  <Textarea
                    value={htmlBody}
                    onChange={e => setHtmlBody(e.target.value)}
                    className="font-mono text-xs min-h-[400px]"
                    placeholder="Paste your email HTML here…"
                  />
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(selected.updated_at).toLocaleString()}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
