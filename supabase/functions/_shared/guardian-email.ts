/**
 * Shared wording for parent/guardian consent verification.
 *
 * Child safety: consent requires TWO independent confirmations — the emailed
 * link (proves the address is reachable) AND a phone call to A'Hara (proves a
 * real person gave consent). Neither is sufficient on its own.
 */
import { EMAIL_FOOTER_HTML } from "./email-footer.ts";

export const AHARA_PHONE = "0412 293255";

const SAFETY_PANEL = `
  <div style="border:2px solid #C0392B;background:#FDECEA;border-radius:10px;padding:16px 18px;margin:20px 0;">
    <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#C0392B;">
      We take child safety very seriously. To complete verification, BOTH steps are required:
    </p>
    <p style="margin:0 0 6px;font-size:15px;color:#C0392B;font-weight:600;">
      (a) Click the button below to confirm this email address is yours.
    </p>
    <p style="margin:0 0 10px;font-size:15px;color:#C0392B;font-weight:600;">
      (b) Call A'Hara on ${AHARA_PHONE} to confirm your consent verbally.
    </p>
    <p style="margin:0;font-size:14px;color:#C0392B;">
      The enrolment cannot be completed, and no photos can be uploaded, until both steps are done.
    </p>
  </div>`;

export function guardianVerificationEmail(opts: {
  guardianName: string | null;
  childName: string | null;
  link: string;
}): { subject: string; html: string } {
  const child = opts.childName?.trim() || "your child";
  const guardian = opts.guardianName?.trim() || "there";

  return {
    subject: `Consent needed for ${child}'s Creator Type profiling`,
    html: `
  <div style="font-family:Questrial,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 24px;color:#2b2b2b;">
    <h2 style="font-size:21px;margin:0 0 16px;color:#5A3A28;">Parent or guardian consent needed</h2>
    <p style="margin:0 0 12px;">Hello ${guardian},</p>
    <p style="margin:0 0 12px;">
      ${child} has started a Creator Type profiling enrolment with 13 Creators and has
      named you as their parent or guardian.
    </p>
    ${SAFETY_PANEL}
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${opts.link}" style="display:inline-block;background:#BB1B56;color:#ffffff;text-decoration:none;
        padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;">Confirm my email address</a>
    </p>
    <p style="margin:0 0 12px;font-size:14px;">
      Profiling involves uploading photographs of your child for body-type analysis by a
      certified practitioner. You can withdraw consent at any time by contacting us.
    </p>
    <p style="margin:0 0 12px;font-size:14px;">
      If you were not expecting this email, please ignore it — nothing will proceed — or
      call the number above to let us know.
    </p>
  </div>
  ${EMAIL_FOOTER_HTML}`,
  };
}

export function guardianReminderEmail(opts: {
  childName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  daysWaiting: number;
}): { subject: string; html: string } {
  const child = opts.childName?.trim() || "A minor enrolment";
  return {
    subject: `Verbal consent still outstanding — ${child} (${opts.daysWaiting} days)`,
    html: `
  <div style="font-family:Questrial,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 24px;color:#2b2b2b;">
    <h2 style="font-size:20px;margin:0 0 16px;color:#5A3A28;">Guardian verbal confirmation outstanding</h2>
    <p style="margin:0 0 12px;">
      A parent/guardian has confirmed their email address, but their verbal confirmation
      has not yet been recorded. The enrolment stays blocked until you tick it.
    </p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:15px;margin:0 0 16px;">
      <tr><td style="color:#8B6F5E;">Enrolment</td><td><strong>${child}</strong></td></tr>
      <tr><td style="color:#8B6F5E;">Guardian</td><td><strong>${opts.guardianName || "—"}</strong></td></tr>
      <tr><td style="color:#8B6F5E;">Phone</td><td><strong>${opts.guardianPhone || "—"}</strong></td></tr>
      <tr><td style="color:#8B6F5E;">Waiting</td><td><strong>${opts.daysWaiting} days</strong></td></tr>
    </table>
    <p style="margin:0 0 12px;font-size:14px;">
      Record the confirmation on the Minor Consent tab of your trainer screen once you have
      spoken with the guardian. This reminder repeats every 3 days until then.
    </p>
  </div>
  ${EMAIL_FOOTER_HTML}`,
  };
}
