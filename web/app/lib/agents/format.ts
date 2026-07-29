const TINYBARS_PER_HBAR = BigInt(100000000);

/**
 * Format tinybars as ℏ. BigInt throughout — never Number (D15).
 * `maxDecimals` trims trailing zeros: 500000000n -> "5", 499852834n -> "4.99852834".
 */
export function formatHbar(tinybars: string | bigint, maxDecimals = 8): string {
  const v = typeof tinybars === 'bigint' ? tinybars : BigInt(tinybars || '0');
  const negative = v < BigInt(0);
  const abs = negative ? -v : v;
  const whole = abs / TINYBARS_PER_HBAR;
  const frac = (abs % TINYBARS_PER_HBAR).toString().padStart(8, '0').slice(0, maxDecimals).replace(/0+$/, '');
  const wholeFormatted = new Intl.NumberFormat(undefined).format(whole);
  return `${negative ? '-' : ''}${wholeFormatted}${frac ? `.${frac}` : ''}`;
}

/** "5 ℏ" / "4.99852834 ℏ" */
export const formatHbarWithUnit = (t: string | bigint) => `${formatHbar(t)} ℏ`;

/** 0x9f8e7d6c…899aab */
export function truncateAddress(address: string | null, lead = 6, tail = 6): string {
  if (!address) return '—';
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 1000], ['minute', 60_000], ['hour', 3_600_000],
    ['day', 86_400_000], ['month', 2_592_000_000], ['year', 31_536_000_000],
  ];
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  let divisor = 1000;
  for (const [u, d] of table) { if (abs >= d) { unit = u; divisor = d; } }
  return rtf.format(Math.round(diffMs / divisor), unit);
}

/** mm:ss countdown, floors at 00:00. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
