export const APP_PUBLIC_ORIGIN = "https://creators13.lovable.app";

export function getAppOrigin(): string {
  if (typeof window === "undefined") return APP_PUBLIC_ORIGIN;

  const { origin, hostname } = window.location;
  const isPreviewHostname = hostname.startsWith("id-preview--") && hostname.endsWith(".lovable.app");

  return isPreviewHostname ? APP_PUBLIC_ORIGIN : origin;
}
