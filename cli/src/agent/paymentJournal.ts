import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { PendingPaymentEntry } from "../types/payment.js";
import { configDir } from "./paths.js";

/** ~/.agent-drive/pending - one file per in-flight payment, named `<quoteId>.json`. */
export function pendingDir(): string {
  return join(configDir(), "pending");
}

function entryPath(quoteId: string): string {
  return join(pendingDir(), `${quoteId}.json`);
}

/**
 * Written *before* phase 2 (submitting `X-PAYMENT`) and deleted only after a confirmed
 * `201`. If the process dies between those two points, the entry is the only record that a
 * payment may have gone out with nothing to show for it locally - see `recoverPending()`.
 */
export async function writePendingEntry(entry: PendingPaymentEntry): Promise<void> {
  const dir = pendingDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = entryPath(entry.quoteId);
  const tmpPath = join(dir, `.${entry.quoteId}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(entry, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, target);
}

export async function deletePendingEntry(quoteId: string): Promise<void> {
  try {
    await rm(entryPath(quoteId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Every currently-journaled entry, oldest state first. Corrupt entries are skipped, not thrown. */
export async function listPendingEntries(): Promise<PendingPaymentEntry[]> {
  let names: string[];
  try {
    names = await readdir(pendingDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const entries: PendingPaymentEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(pendingDir(), name), "utf8");
      entries.push(JSON.parse(raw) as PendingPaymentEntry);
    } catch {
      // A corrupt or half-written journal entry shouldn't block reporting the rest.
      continue;
    }
  }
  return entries;
}

export async function hasPendingEntries(): Promise<boolean> {
  const entries = await listPendingEntries();
  return entries.length > 0;
}
