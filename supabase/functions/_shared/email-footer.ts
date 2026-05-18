/**
 * Shared branded email footer HTML for all 13 Creators email templates.
 * Uses the logo-derived colour palette for consistent branding.
 */

const LOGO_URL =
  "https://iifgrxnkiejfvltzlvkd.supabase.co/storage/v1/object/public/email-assets/13creators-logo.png";

export const EMAIL_FOOTER_HTML = `
<!-- 13 Creators Branded Footer -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-top:2px solid #E8DDD4;">
      <tr><td style="padding:28px 24px;text-align:center;background:#FAF7F4;">
        <a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
          <img src="${LOGO_URL}" alt="13 Creators" width="48" height="48" style="display:inline-block;width:48px;height:auto;border:0;" />
        </a>
        <p style="margin:12px 0 0 0;font-size:13px;color:#5A3A28;font-family:'Questrial',Arial,sans-serif;">
          Create &amp; Come Alive with Creator Types
        </p>
        <p style="margin:10px 0 0 0;">
          <a href="https://www.13creators.com" target="_blank" rel="noopener noreferrer"
            style="font-size:12px;color:#BB1B56;text-decoration:none;font-weight:600;font-family:'Questrial',Arial,sans-serif;">
            www.13creators.com
          </a>
        </p>
        <p style="margin:16px 0 0 0;font-size:11px;color:#8B6F5E;font-family:'Questrial',Arial,sans-serif;">
          © ${new Date().getFullYear()} 13 Creators · All rights reserved
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

export default EMAIL_FOOTER_HTML;
