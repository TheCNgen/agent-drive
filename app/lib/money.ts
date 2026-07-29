export const TINYBARS_PER_HBAR = BigInt("100000000");

/** "1.5" → "150000000". Throws on >8dp, negative, zero, non-numeric. */
export function hbarToTinybars(hbar: string): string {
  const v = String(hbar).trim();
  if (!/^\d+(\.\d{1,8})?$/.test(v))
    throw new Error(`invalid HBAR amount: ${hbar}`);
  const [whole, frac = ""] = v.split(".");
  const t = BigInt(whole) * TINYBARS_PER_HBAR + BigInt(frac.padEnd(8, "0"));
  if (t <= BigInt(0)) throw new Error("amount must be greater than zero");
  return t.toString();
}

/** "150000000" → "1.5". Display only. */
export function formatHbar(tinybars: string): string {
  const t = BigInt(tinybars);
  const whole = t / TINYBARS_PER_HBAR;
  const frac = (t % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export const hashscanTx = (id: string) =>
  `https://hashscan.io/testnet/transaction/${id}`;
export const hashscanAcct = (id: string) =>
  `https://hashscan.io/testnet/account/${id}`;

/** "0.0.5@1700000000.000000000" → "0.0.5-1700000000-000000000" for Mirror Node URLs. */
export const mirrorTxId = (id: string) =>
  id.replace("@", "-").replace(/\.(\d+)$/, "-$1");
