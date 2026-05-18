import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ProfilingDataMap = Record<string, unknown>;

function toProfilingDataMap(value: Json | null | undefined): ProfilingDataMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ProfilingDataMap;
}

export async function loadCreatorProfilingData(userId: string): Promise<ProfilingDataMap> {
  const { data, error } = await supabase
    .from("creator_type_profiles")
    .select("profiling_data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return toProfilingDataMap(data?.profiling_data);
}

export async function mergeCreatorProfilingData(
  userId: string,
  patch: ProfilingDataMap
): Promise<ProfilingDataMap> {
  const existing = await loadCreatorProfilingData(userId);
  const merged: ProfilingDataMap = {
    ...existing,
    ...patch,
  };

  const { error } = await supabase
    .from("creator_type_profiles")
    .upsert(
      {
        user_id: userId,
        profiling_data: merged as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) throw error;
  return merged;
}

export function getStoragePathFromPublicUrl(pathOrUrl?: string): string | undefined {
  if (!pathOrUrl) return undefined;

  const marker = "/object/public/profiling-photos/";
  const markerIndex = pathOrUrl.indexOf(marker);

  if (markerIndex === -1) return pathOrUrl;

  const rawPath = pathOrUrl.slice(markerIndex + marker.length).split("?")[0];
  return decodeURIComponent(rawPath);
}
