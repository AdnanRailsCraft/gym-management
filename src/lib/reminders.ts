/**
 * Pure reminder-message helpers (safe for client components: no secrets, no I/O).
 * The app is offline, so "sending" means handing a ready-to-send message to the
 * system's WhatsApp/SMS handler or copying it to the clipboard.
 */

export interface ReminderMessageInput {
  gymName: string;
  memberName: string;
  planName: string;
  endOn: string;
  daysLeft: number;
}

export function buildReminderMessage(input: ReminderMessageInput): string {
  const { gymName, memberName, planName, endOn, daysLeft } = input;
  const first = memberName.trim().split(/\s+/)[0] || memberName;
  if (daysLeft > 1) {
    return `Hi ${first}, this is ${gymName}. Your ${planName} membership ends on ${endOn} (${daysLeft} days from now). Please visit the reception to renew and keep your access without a break.`;
  }
  if (daysLeft === 1) {
    return `Hi ${first}, this is ${gymName}. Your ${planName} membership ends tomorrow (${endOn}). Please visit the reception to renew and keep your access without a break.`;
  }
  if (daysLeft === 0) {
    return `Hi ${first}, this is ${gymName}. Your ${planName} membership ends today (${endOn}). Please visit the reception to renew so your access is not interrupted.`;
  }
  const ago = Math.abs(daysLeft);
  return `Hi ${first}, this is ${gymName}. Your ${planName} membership ended on ${endOn} (${ago} day${ago === 1 ? "" : "s"} ago). We would love to have you back - visit the reception to renew.`;
}

/**
 * Convert a locally-entered phone number into the international digits that
 * wa.me expects. Handles the common Pakistani formats (0300-1234567 and
 * +92 300 1234567); anything else is passed through as digits only.
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

export function whatsappHref(phone: string | null | undefined, message: string): string | null {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function smsHref(phone: string | null | undefined, message: string): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const target = raw.replace(/\s+/g, "");
  return `sms:${target}?body=${encodeURIComponent(message)}`;
}
