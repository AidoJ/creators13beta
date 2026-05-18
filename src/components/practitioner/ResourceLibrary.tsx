import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Video, Music, Image, File, Download, ExternalLink, Play } from "lucide-react";
import { getCreatorTypeColor } from "@/lib/creatorTypes";

// Glyph image imports
import glyphLava from "@/assets/glyph-lava.png";
import glyphFire from "@/assets/glyph-fire.png";
import glyphWhirlwind from "@/assets/glyph-whirlwind.png";
import glyphSun from "@/assets/glyph-sun.png";
import glyphLightning from "@/assets/glyph-lightning.png";
import glyphSnow from "@/assets/glyph-snow.png";
import glyphSky from "@/assets/glyph-sky.png";
import glyphMountain from "@/assets/glyph-mountain.png";
import glyphTree from "@/assets/glyph-tree.png";
import glyphSoil from "@/assets/glyph-soil.png";
import glyphRiver from "@/assets/glyph-river.png";
import glyphOcean from "@/assets/glyph-ocean.png";
import glyphLake from "@/assets/glyph-lake.png";

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

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const TYPE_CONFIG: Record<string, { icon: typeof File; color: string }> = {
  video: { icon: Video, color: "text-blue-500" },
  audio: { icon: Music, color: "text-purple-500" },
  document: { icon: FileText, color: "text-amber-500" },
  image: { icon: Image, color: "text-green-500" },
  url: { icon: ExternalLink, color: "text-cyan-500" },
};

const ALL_CATEGORIES = ["teaching_calls", "case_study_calls", "group_discovery_calls", "masterclasses", "orientation"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  teaching_calls: "Teaching Calls",
  case_study_calls: "Case Study Calls",
  group_discovery_calls: "Group Discovery Calls",
  masterclasses: "Masterclasses",
  orientation: "Orientation",
};

// Glyph map keyed by creator type name (lowercase)
const GLYPH_MAP: Record<string, string> = {
  lava: glyphLava, fire: glyphFire, whirlwind: glyphWhirlwind,
  sun: glyphSun, lightning: glyphLightning, snow: glyphSnow, sky: glyphSky,
  mountain: glyphMountain, tree: glyphTree, soil: glyphSoil,
  river: glyphRiver, ocean: glyphOcean, lake: glyphLake,
};

function detectCreatorType(title: string) {
  const lower = title.toLowerCase();
  for (const key of Object.keys(GLYPH_MAP)) {
    if (lower.includes(key)) {
      return { key, glyph: GLYPH_MAP[key], color: getCreatorTypeColor(key) };
    }
  }
  return null;
}

export default function ResourceLibrary() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("training_resources")
      .select("id, title, description, resource_type, category, file_name, file_size_bytes, storage_path, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setResources(data || []);
        setLoading(false);
      });
  }, []);

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

  function getPublicUrl(path: string) {
    return supabase.storage.from("training-resources").getPublicUrl(path).data.publicUrl;
  }

  function handleOpen(resource: Resource) {
    if (resource.resource_type === "url") {
      window.open(resource.storage_path, "_blank");
      return;
    }
    const url = getPublicUrl(resource.storage_path);
    if (resource.resource_type === "video" || resource.resource_type === "audio") {
      setPreviewUrl(url);
      setPreviewType(resource.resource_type);
    } else {
      window.open(url, "_blank");
    }
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading resources…</div>;

  if (resources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No training resources available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-muted-foreground">Filter:</span>
        {ALL_CATEGORIES.map(cat => {
          const active = activeFilters.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleFilter(cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[cat]}
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

      {/* Media preview */}
      {previewUrl && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Preview</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreviewUrl(null)}>Close</Button>
          </div>
          {previewType === "video" ? (
            <video src={previewUrl} controls className="w-full rounded-lg max-h-96" />
          ) : (
            <audio src={previewUrl} controls className="w-full" />
          )}
        </div>
      )}

      {/* Resource grid */}
      {filteredResources.length === 0 && activeFilters.size > 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">No resources match the selected filters.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredResources.map(r => {
          const cfg = TYPE_CONFIG[r.resource_type] || { icon: File, color: "text-muted-foreground" };
          const Icon = cfg.icon;
          const creatorType = detectCreatorType(r.title);
          return (
            <div
              key={r.id}
              className="rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col"
              style={creatorType ? {
                borderColor: `${creatorType.color}66`,
              } : undefined}
            >
              {/* Coloured accent bar at top */}
              <div
                className="h-1.5 w-full flex-shrink-0"
                style={{
                  background: creatorType
                    ? `linear-gradient(90deg, ${creatorType.color}, ${creatorType.color}88)`
                    : "hsl(var(--border))",
                }}
              />

              <div className="p-4 flex flex-col flex-1 gap-3">
                {/* Header row: glyph/icon + title + type badge */}
                <div className="flex items-start gap-3">
                  {/* Glyph or resource-type icon */}
                  {creatorType ? (
                    <div
                      className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: creatorType.color }}
                    >
                      <img
                        src={creatorType.glyph}
                        alt={creatorType.key}
                        className="w-7 h-7 object-contain"
                        style={{ filter: "brightness(0) invert(1)" }}
                      />
                    </div>
                  ) : (
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-muted/60 ${cfg.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{r.title}</h4>

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {creatorType && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                          style={{ backgroundColor: `${creatorType.color}20`, color: creatorType.color }}
                        >
                          <span
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: creatorType.color }}
                          >
                            <img src={creatorType.glyph} alt="" className="w-2.5 h-2.5 object-contain" style={{ filter: "brightness(0) invert(1)" }} />
                          </span>
                          {creatorType.key}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px] capitalize gap-1">
                        <Icon className="h-2.5 w-2.5" />
                        {CATEGORY_LABELS[r.category] ?? r.resource_type}
                      </Badge>
                      {r.file_size_bytes ? (
                        <span className="text-[10px] text-muted-foreground">{formatBytes(r.file_size_bytes)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {r.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{r.description}</p>
                )}

                {/* Action buttons — pushed to bottom */}
                <div className="flex gap-2 mt-auto pt-1">
                  {r.resource_type === "url" ? (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => handleOpen(r)}>
                      <ExternalLink className="h-3 w-3 mr-1" />Open Link
                    </Button>
                  ) : (r.resource_type === "video" || r.resource_type === "audio") ? (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => handleOpen(r)}>
                      <Play className="h-3 w-3 mr-1" />Play
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => handleOpen(r)}>
                      <ExternalLink className="h-3 w-3 mr-1" />Open
                    </Button>
                  )}
                  {r.resource_type !== "url" && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                      <a href={getPublicUrl(r.storage_path)} download={r.file_name}>
                        <Download className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
