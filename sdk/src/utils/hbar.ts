import type { Tinybars } from "../types/common.js";

export const TINYBARS_PER_HBAR = 100_000_000n;

const TINYBARS_PATTERN = /^[1-9][0-9]*$/;
const DECIMAL_PATTERN = /^([0-9]+)(?:\.([0-9]+))?$/;

/** The backend's exact price-format regex: a positive integer, no leading zeros, `"0"` excluded. */
export function isValidTinybars(v: string): boolean {
  return TINYBARS_PATTERN.test(v);
}

/**
 * Converts a decimal HBAR amount into a tinybars string. Parses the string manually —
 * splits on `.`, right-pads the fraction to 8 places — and never uses `parseFloat`, so
 * there's no binary floating-point rounding error.
 */
export function hbarToTinybars(hbar: string | number): Tinybars {
  const str = typeof hbar === "number" ? hbar.toString() : hbar;
  const trimmed = str.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const match = DECIMAL_PATTERN.exec(unsigned);
  if (!match) {
    throw new RangeError(`"${hbar}" is not a valid decimal HBAR amount.`);
  }
  const wholeStr = match[1] as string;
  const fracStr = match[2] ?? "";
  if (fracStr.length > 8) {
    throw new RangeError(`"${hbar}" has more than 8 decimal places; tinybars is HBAR's smallest unit.`);
  }

  const whole = BigInt(wholeStr);
  const frac = BigInt(fracStr.padEnd(8, "0") || "0");
  const tinybars = whole * TINYBARS_PER_HBAR + frac;
  return (negative && tinybars !== 0n ? -tinybars : tinybars).toString();
}

/** Converts a tinybars string into a fixed 8dp HBAR decimal string, with trailing zeros trimmed. */
export function tinybarsToHbar(t: Tinybars): string {
  const negative = t.startsWith("-");
  const unsigned = negative ? t.slice(1) : t;
  const value = BigInt(unsigned);
  const whole = value / TINYBARS_PER_HBAR;
  const frac = value % TINYBARS_PER_HBAR;
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  const result = fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  return negative && value !== 0n ? `-${result}` : result;
}

/** Sums any number of tinybars strings, returning a tinybars string. */
export function addTinybars(...values: Tinybars[]): Tinybars {
  return values.reduce((acc, v) => acc + BigInt(v), 0n).toString();
}

/**
 * Integer-floor percentage of a tinybars amount: `(v * percent) / 100`, truncated toward
 * zero exactly like the backend's `(v * BigInt(percent)) / 100n` fee arithmetic. `percent`
 * must be an integer — the backend's own computation throws on a fractional rate (`BigInt()`
 * rejects non-integers), so this validates the same constraint up front.
 */
export function percentOfTinybars(v: Tinybars, percent: number): Tinybars {
  if (!Number.isInteger(percent)) {
    throw new RangeError(`percent must be an integer (the backend's fee arithmetic requires it), got ${percent}.`);
  }
  return ((BigInt(v) * BigInt(percent)) / 100n).toString();
}
