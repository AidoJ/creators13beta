/**
 * Shared contact-channel types + helpers for Batch C.
 * Channel handles live in profiles.contact_channels (jsonb). The shape is
 * validated server-side by profiles_validate_contact_channels.
 */

export type ContactChannels = {
  email?: string | null;
  phone_number?: string | null;
  phone_call_ok?: boolean | null;
  phone_sms_ok?: boolean | null;
  whatsapp?: string | null;
  messenger?: string | null;
  telegram?: string | null;
  other?: string | null;
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  phone_call: "Phone (call OK)",
  phone_sms: "Phone (SMS OK)",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  telegram: "Telegram",
  other: "Other",
};

export type RequestStatus =
  | "pending"
  | "approved"
  | "declined"
  | "withdrawn"
  | "revoked";

export function formatAuDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Example: "12 March 2026, 14:32 AEDT"
  const date = d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return `${date}, ${time}`;
}

export function formatAuDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function relativeFromNow(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
