import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, Underline, Link2, Image as ImageIcon, List, ListOrdered, Heading2, Upload, Undo2, Redo2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** Public Storage bucket name for image uploads. Defaults to email-assets. */
  uploadBucket?: string;
}

/**
 * Lightweight HTML editor (contentEditable + execCommand) with toolbar for
 * bold/italic/underline, headings, lists, hyperlinks and images (URL or upload).
 * Images uploaded via the toolbar are stored in a public Supabase bucket so they
 * can be embedded in outbound emails.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  className,
  minHeight = 180,
  uploadBucket = "email-assets",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const savedRange = useRef<Range | null>(null);

  // Keep editor DOM in sync if the parent resets the value (e.g. after submit).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const exec = useCallback((cmd: string, arg?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(cmd, false, arg);
    emitChange();
  }, [emitChange]);

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function openLinkDialog() {
    saveSelection();
    const sel = window.getSelection();
    setLinkText(sel?.toString() || "");
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink() {
    if (!linkUrl.trim()) { setLinkOpen(false); return; }
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith("mailto:")) url = `https://${url}`;
    editorRef.current?.focus();
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().length > 0;
    if (hasSelection) {
      document.execCommand("createLink", false, url);
      // Add target=_blank to the newly created anchor(s) in selection.
      editorRef.current?.querySelectorAll(`a[href="${CSS.escape(url)}"]`).forEach(a => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      });
    } else {
      const text = linkText.trim() || url;
      const html = `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
      document.execCommand("insertHTML", false, html);
    }
    emitChange();
    setLinkOpen(false);
  }

  function openImageDialog() {
    saveSelection();
    setImageUrl("");
    setImageAlt("");
    setImageOpen(true);
  }

  function insertImageHtml(url: string, alt: string) {
    editorRef.current?.focus();
    restoreSelection();
    const html = `<img src="${url}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px;" />`;
    document.execCommand("insertHTML", false, html);
    emitChange();
  }

  function applyImageUrl() {
    if (!imageUrl.trim()) { setImageOpen(false); return; }
    insertImageHtml(imageUrl.trim(), imageAlt.trim());
    setImageOpen(false);
  }

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `event-descriptions/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(uploadBucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(uploadBucket).getPublicUrl(path);
      insertImageHtml(pub.publicUrl, file.name);
      setImageOpen(false);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const isEmpty = !value || value.replace(/<[^>]*>/g, "").trim() === "";

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
        <ToolbarBtn onClick={() => exec("bold")} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("italic")} title="Italic"><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("underline")} title="Underline"><Underline className="h-3.5 w-3.5" /></ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => exec("formatBlock", "<h2>")} title="Heading"><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("formatBlock", "<blockquote>")} title="Quote"><Quote className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={openLinkDialog} title="Insert link"><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={openImageDialog} title="Insert image"><ImageIcon className="h-3.5 w-3.5" /></ToolbarBtn>
        <Divider />
        <ToolbarBtn onClick={() => exec("undo")} title="Undo"><Undo2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec("redo")} title="Redo"><Redo2 className="h-3.5 w-3.5" /></ToolbarBtn>
      </div>
      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={() => { saveSelection(); emitChange(); }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onPaste={(e) => {
            // Strip rich formatting from pasted HTML to keep content tidy.
            const text = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
            if (text) {
              e.preventDefault();
              const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: ["b","strong","i","em","u","a","p","br","ul","ol","li","h2","h3","blockquote","img","span","div"], ALLOWED_ATTR: ["href","target","rel","src","alt","style"] });
              document.execCommand("insertHTML", false, clean);
              emitChange();
            }
          }}
          className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 text-sm focus:outline-none [&_a]:text-primary [&_a]:underline [&_img]:my-2 [&_h2]:text-base [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          style={{ minHeight }}
        />
      </div>

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Insert link</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">URL</Label>
              <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://example.com" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Link text (optional)</Label>
              <Input value={linkText} onChange={e => setLinkText(e.target.value)} placeholder="Click here" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={applyLink}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image dialog */}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Insert image</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Image URL</Label>
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
              <Label className="mt-2 block text-xs">Alt text (optional)</Label>
              <Input value={imageAlt} onChange={e => setImageAlt(e.target.value)} placeholder="Describe the image" />
              <Button className="mt-3 w-full" onClick={applyImageUrl} disabled={!imageUrl.trim()}>Insert from URL</Button>
            </div>
            <div className="border-t pt-3">
              <Label className="text-xs">…or upload a file (max 5 MB)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await handleFileUpload(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button variant="outline" className="mt-2 w-full" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="mr-2 h-4 w-4" />{uploading ? "Uploading…" : "Choose file"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImageOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); /* keep selection */ }}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Sanitize stored HTML before rendering. */
export function sanitizeEventHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b","strong","i","em","u","a","p","br","ul","ol","li","h2","h3","blockquote","img","span","div"],
    ALLOWED_ATTR: ["href","target","rel","src","alt","style"],
  });
}
