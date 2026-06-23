/**
 * Profiling-photos bucket is PRIVATE.
 * All client-side reads must go through signed URLs.
 *
 * Expiry choices:
 *   view       — 1 hour. Interactive viewing in the app; if a page is held
 *                open >1hr, a reload re-signs.
 *   reportGen  — 5 min. Single PDF-generation pass that downloads images
 *                into a blob; never persisted.
 *   emailEmbed — 7 days. URLs embedded into emailed reports the client opens
 *                later. Trade-off accepted: email images go blank after 7
 *                days; the report PDF (if requested) can be re-sent.
 */
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "profiling-photos";

export const PROFILING_PHOTO_EXPIRY = {
  view: 60 * 60,
  reportGen: 5 * 60,
  emailEmbed: 7 * 24 * 60 * 60,
} as const;

export async function signProfilingPhotoUrl(
  path: string | null | undefined,
  expiresIn: number = PROFILING_PHOTO_EXPIRY.view,
  transform?: { width?: number; height?: number; quality?: number },
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn, transform ? { transform } : undefined);
  if (error || !data?.signedUrl) {
    console.error("[profiling-photos] sign failed", { path, error });
    return null;
  }
  return data.signedUrl;
}

export async function signProfilingPhotoUrls(
  paths: string[],
  expiresIn: number = PROFILING_PHOTO_EXPIRY.view,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) {
    console.error("[profiling-photos] batch-sign failed", error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

/**
 * Render a single private profiling-photos image. Signs on mount,
 * re-signs when `path` changes. Returns null while loading or on error
 * so callers can keep their existing fallback markup.
 */
type SignedProfilingImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  path: string | null | undefined;
  expiresIn?: number;
  transform?: { width?: number; height?: number; quality?: number };
};

export function SignedProfilingImage({
  path,
  expiresIn = PROFILING_PHOTO_EXPIRY.view,
  transform,
  ...imgProps
}: SignedProfilingImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    signProfilingPhotoUrl(path, expiresIn, transform).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path, expiresIn, transform?.width, transform?.height, transform?.quality]);

  if (!url) return null;
  return <img src={url} {...imgProps} />;
}
