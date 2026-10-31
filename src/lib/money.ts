/**
 * Money helpers. All stored amounts are integer minor units (AGENT_PROMPT 4);
 * these functions are the only place that converts to/from the display form.
 */

function clampMinorUnits(minorUnits: number): number {
  if (!Number.isFinite(minorUnits)) return 2;
  return Math.min(Math.max(Math.trunc(minorUnits), 0), 4);
}

/** Major-unit number for use as a form input default. */
export function minorToMajor(amountMinor: number, minorUnits: number): number {
  return amountMinor / 10 ** clampMinorUnits(minorUnits);
}

export function formatMinorUnits(
  amountMinor: number,
  currencyCode: string,
  minorUnits: number,
  locale = "en-US",
): string {
  const digits = clampMinorUnits(minorUnits);
  const major = amountMinor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${currencyCode} ${major.toFixed(digits)}`;
  }
}

/**
 * Parse a human-entered major-unit amount (e.g. "3000" or "3000.50") into
 * integer minor units. Returns null for anything malformed or negative.
 */
export function parseMajorToMinor(
  value: string | number | null | undefined,
  minorUnits: number,
): number | null {
  if (value === null || value === undefined) return null;
  const digits = clampMinorUnits(minorUnits);
  const text = String(value).trim();
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const fracPadded = (frac + "0".repeat(digits)).slice(0, digits);
  const minor = Number(whole) * 10 ** digits + (digits > 0 ? Number(fracPadded) : 0);
  return Number.isSafeInteger(minor) ? minor : null;
}
