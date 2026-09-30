import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProspectusSection } from "@/lib/prospectus";
import { canvasPaths, isCanvas, PAGE_PRIMARY_KEYS, type CanvasLayout } from "@/lib/prospectusCanvas";

export type ProspectusRow = ProspectusSection & { canvas_layout: CanvasLayout | null };

/** Loads prospectus sections, per-page canvases and fresh signed URLs for every private image. */
export function useProspectusData(enabled = true) {
  const [rows, setRows] = useState<ProspectusRow[] | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});

  const sign = useCallback(async (paths: string[]) => {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return {};
    const { data } = await supabase.storage.from("prospectus-assets").createSignedUrls(unique, 3600);
    const map = Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
    setSigned((prev) => ({ ...prev, ...map }));
    return map;
  }, []);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("prospectus_sections" as any).select("id, sort_order, layout_key, heading, body, image_urls, canvas_layout").order("sort_order");
    const loaded = ((data as unknown as ProspectusRow[]) ?? []);
    const inline = loaded.flatMap((s) => Array.from((s.body ?? "").matchAll(/data-storage-path=["']([^"']+)["']/g), (m) => m[1]));
    const map = await sign([...loaded.flatMap((s) => Object.values(s.image_urls ?? {})), ...inline, ...loaded.flatMap((s) => canvasPaths(s.canvas_layout))]);
    setRows(loaded.map((s) => ({ ...s, body: (s.body ?? "").replace(/(<img\b[^>]*data-storage-path=["']([^"']+)["'][^>]*\bsrc=["'])[^"']*(["'])/gi, (_a, b, p, c) => `${b}${map[p] ?? ""}${c}`) })));
  }, [sign]);

  useEffect(() => { if (enabled) reload(); }, [enabled, reload]);

  const imageUrls = Object.fromEntries((rows ?? []).map((r) => [r.layout_key, Object.fromEntries(Object.entries(r.image_urls ?? {}).map(([k, p]) => [k, signed[p] ?? ""]))]));
  const canvases: Record<number, CanvasLayout> = {};
  PAGE_PRIMARY_KEYS.forEach((key, i) => {
    const row = rows?.find((r) => r.layout_key === key);
    if (row && isCanvas(row.canvas_layout)) canvases[i + 1] = row.canvas_layout;
  });
  return { rows, setRows, signed, sign, reload, imageUrls, canvases };
}
