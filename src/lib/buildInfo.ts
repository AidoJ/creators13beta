/** Build marker. Injected by Vite at build time (see `define` in
 *  vite.config.ts) so it changes on EVERY deploy — a hard-coded string here
 *  silently went stale for weeks and made "are the phones on the latest
 *  build?" impossible to answer. */
declare const __APP_BUILD_ID__: string;
declare const __APP_BUILT_AT__: string;

export const APP_BUILD_HASH =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev-local";
export const APP_BUILT_AT =
  typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : new Date().toISOString();
export const APP_BUILD_LABEL = `Creators13 ${APP_BUILD_HASH}`;

/** "3 Aug 2026, 03:12 UTC" — a date a human can compare against "I shipped
 *  the fix on Sunday night", which a bare hash can't do. */
export function formatBuildDate(iso: string = APP_BUILT_AT): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  const day = d.getUTCDate();
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}
