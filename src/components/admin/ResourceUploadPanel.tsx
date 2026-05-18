import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, Trash2, FileText, Video, Music, Image, File, ExternalLink } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Resource {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  category: string;
  file_name: string;
  file_size_bytes: number | null;
  storage_path: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "teaching_calls", label: "Teaching Calls" },
  { value: "case_study_calls", label: "Case Study Calls" },
  { value: "group_discovery_calls", label: "Group Discovery Calls" },
  { value: "masterclasses", label: "Masterclasses" },
  { value: "orientation", label: "Orientation" },
];

const RESOURCE_TYPES = [
  { value: "video", label: "Video", icon: Video },
  { value: "document", label: "Document / PDF", icon: FileText },
  { value: "audio", label: "Audio", icon: Music },
  { value: "image", label: "Image", icon: Image },
  { value: "url", label: "URL / Link", icon: ExternalLink },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function typeIcon(type: string) {
  const t = RESOURCE_TYPES.find(r => r.value === type);
  const Icon = t?.icon || File;
  return <Icon className="h-4 w-4" />;
}

const TYPE_COLORS: Record<string, string> = {
  video: "text-blue-500",
  audio: "text-purple-500",
  document: "text-amber-500",
  image: "text-green-500",
  url: "text-cyan-500",
};
const TYPE_LABELS: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  document: "Docs",
  image: "Image",
  url: "Links",
};

export default function ResourceUploadPanel() {
  const { user } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("document");
  const [category, setCategory] = useState("orientation");
  const [file, setFile] = useState<File | null>(null);
  const [urlValue, setUrlValue] = useState("");

  function toggleFilter(type: string) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filteredResources = activeFilters.size === 0
    ? resources
    : resources.filter(r => activeFilters.has(r.category));

  const fetchResources = useCallback(async () => {
    const { data } = await supabase
      .from("training_resources")
      .select("id, title, description, resource_type, category, file_name, file_size_bytes, storage_path, created_at")
      .order("created_at", { ascending: false });
    setResources(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  async function handleUpload() {
    if (!title.trim() || !user) return;

    if (resourceType === "url") {
      if (!urlValue.trim()) return;
      const { error: dbError } = await supabase.from("training_resources").insert({
        title: title.trim(),
        description: description.trim() || null,
        resource_type: "url",
        category,
        storage_path: urlValue.trim(),
        file_name: urlValue.trim(),
        file_size_bytes: null,
        mime_type: "text/uri-list",
        uploaded_by: user.id,
      });
      if (dbError) {
        toast({ title: "Save failed", description: dbError.message, variant: "destructive" });
      } else {
        toast({ title: "Link saved" });
        setTitle(""); setDescription(""); setUrlValue(""); setResourceType("document"); setCategory("orientation");
        await fetchResources();
      }
      return;
    }

    if (!file) return;
    setUploading(true);

    const storagePath = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: storageError } = await supabase.storage
      .from("training-resources")
      .upload(storagePath, file);

    if (storageError) {
      toast({ title: "Upload failed", description: storageError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from("training_resources").insert({
      title: title.trim(),
      description: description.trim() || null,
      resource_type: resourceType,
      category,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    });

    if (dbError) {
      toast({ title: "Save failed", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Resource uploaded" });
      setTitle(""); setDescription(""); setFile(null); setResourceType("document"); setCategory("orientation");
      await fetchResources();
    }
    setUploading(false);
  }

  async function handleDelete(resource: Resource) {
    const { error: storageErr } = await supabase.storage
      .from("training-resources")
      .remove([resource.storage_path]);

    const { error: dbErr } = await supabase
      .from("training_resources")
      .delete()
      .eq("id", resource.id);

    if (storageErr || dbErr) {
      toast({ title: "Delete failed", description: (storageErr || dbErr)?.message, variant: "destructive" });
    } else {
      toast({ title: "Resource deleted" });
      await fetchResources();
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Upload New Resource
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Body Region Training Video" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-sm">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description of this resource…" />
        </div>

        {resourceType === "url" ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground">URL *</label>
            <Input value={urlValue} onChange={e => setUrlValue(e.target.value)} placeholder="https://example.com/resource" type="url" />
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-muted-foreground">File *</label>
            <Input
              type="file"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="mt-1"
              accept="video/*,audio/*,application/pdf,image/*,.doc,.docx,.ppt,.pptx"
            />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name} ({formatBytes(file.size)})</p>}
          </div>
        )}

        <Button onClick={handleUpload} disabled={!title.trim() || (resourceType === "url" ? !urlValue.trim() : !file) || uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
          {resourceType === "url" ? "Save Link" : "Upload Resource"}
        </Button>
      </div>

      {/* Resource list */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center px-4 py-3 border-b border-border bg-muted/20">
          <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          {CATEGORIES.map(c => {
            const active = activeFilters.has(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggleFilter(c.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
            >
              Clear
            </button>
          )}
        </div>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Resource</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Category</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Size</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Uploaded</th>
              <th className="w-16 text-left px-2 py-2.5 font-medium text-muted-foreground text-xs sticky right-0 bg-muted/30">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : filteredResources.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{activeFilters.size > 0 ? "No resources match the selected filters." : "No resources uploaded yet."}</td></tr>
            ) : filteredResources.map(r => (
              <tr key={r.id} className="group border-b border-border last:border-0 hover:bg-accent/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {typeIcon(r.resource_type)}
                    <div>
                      <p className="font-medium text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.file_name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="text-[10px]">{CATEGORIES.find(c => c.value === r.category)?.label ?? r.category}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatBytes(r.file_size_bytes)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-AU")}</td>
                <td className="px-2 py-3 sticky right-0 bg-card group-hover:bg-accent/20">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete resource?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{r.title}" and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
