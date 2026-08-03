/** Build marker. Injected by Vite at build time (see `define` in
 *  vite.config.ts) so it changes on EVERY deploy — a hard-coded string here
 *  silently went stale for weeks and made "are the phones on the latest
 *  build?" impossible to answer. */
declare const __APP_BUILD_ID__: string;

export const APP_BUILD_HASH =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev-local";
export const APP_BUILD_LABEL = `Creators13 ${APP_BUILD_HASH}`;
