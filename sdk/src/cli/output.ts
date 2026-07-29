import { isCashDriveError } from "../errors.js";
import { redactObject } from "../core/redact.js";

export function writeStdout(line: string): void {
  process.stdout.write(line.endsWith("\n") ? line : line + "\n");
}

export function writeStderr(line: string): void {
  process.stderr.write(line.endsWith("\n") ? line : line + "\n");
}

export function writeJsonLine(obj: unknown): void {
  process.stdout.write(JSON.stringify(redactObject(obj)) + "\n");
}

export function exitCodeForError(err: unknown): number {
  if (!isCashDriveError(err)) return 1;
  switch (err.code) {
    case "missing_credentials":
      return 3;
    case "claim_invalid":
      return 4;
    case "network_error":
    case "timeout":
      return 5;
    case "activation_failed":
      return 6;
    case "bad_request":
      return 2;
    default:
      return 1;
  }
}

/**
 * Reports an error on the appropriate channel for the mode, and returns the exit code.
 *
 * Deliberately bypasses writeJsonLine's redaction: this envelope's `code` field is the
 * CashDriveError discriminant agents branch on (e.g. "claim_invalid"), not a claim code --
 * redactObject's generic "code" rule exists for the latter and would otherwise mangle the
 * former. `message` is always one of our own canned strings or a generic Error message,
 * never a value that embeds a secret.
 */
export function reportError(err: unknown, json: boolean): number {
  const message = err instanceof Error ? err.message : String(err);
  const code = isCashDriveError(err) ? err.code : "unknown_error";
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: message, code }) + "\n");
  } else {
    writeStderr(`Error: ${message}`);
  }
  return exitCodeForError(err);
}

/** tinybars string -> trimmed HBAR string, e.g. "500000000" -> "5", "12345678" -> "0.12345678". */
export function tinybarsToHbar(tinybars: string, fractionDigits = 8): string {
  const value = Number(tinybars) / 1e8;
  return value.toFixed(fractionDigits).replace(/\.?0+$/, "") || "0";
}
