import { onboardCommand } from "./commands/onboard.js";
import { whoamiCommand } from "./commands/whoami.js";
import { logoutCommand } from "./commands/logout.js";
import { paymentsCommand } from "./commands/payments.js";
import { purchaseCommand } from "./commands/purchase.js";
import { itemsCommand } from "./commands/items.js";
import { listingsCommand } from "./commands/listings.js";
import { sharedLinksCommand } from "./commands/sharedLinks.js";
import { affiliatesCommand } from "./commands/affiliates.js";
import { transactionsCommand } from "./commands/transactions.js";
import { versionCommand, helpCommand } from "./commands/version.js";
import { reportError, writeStderr } from "./output.js";

export type FlagValue = string | boolean;

export interface ParsedArgs {
  command: string | undefined;
  flags: Record<string, FlagValue>;
  positionals: string[];
}

/** Hand-rolled: `--flag value`, `--flag=value`, and bare boolean `--flag` are all supported. */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, FlagValue> = {};
  const positionals: string[] = [];
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (command === undefined) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, flags, positionals };
}

export function flagString(flags: Record<string, FlagValue>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagBoolean(flags: Record<string, FlagValue>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

export async function run(argv: string[]): Promise<number> {
  const { command, flags, positionals } = parseArgs(argv);
  const json = flagBoolean(flags, "json");

  if (command === undefined && (flags.version === true || flags.v === true)) {
    return versionCommand();
  }
  if (command === undefined && (flags.help === true || flags.h === true)) {
    return helpCommand();
  }

  try {
    switch (command) {
      case "onboard":
        return await onboardCommand(flags, json);
      case "whoami":
        return await whoamiCommand(flags, json);
      case "logout":
        return await logoutCommand(flags, json);
      case "payments":
        return await paymentsCommand(positionals[0], flags, json);
      case "purchase":
        return await purchaseCommand(positionals[0], positionals[1], flags, json);
      case "items":
        return await itemsCommand(positionals[0], positionals.slice(1), flags, json);
      case "listings":
        return await listingsCommand(positionals[0], positionals.slice(1), flags, json);
      case "links":
        return await sharedLinksCommand(positionals[0], positionals.slice(1), flags, json);
      case "affiliates":
        return await affiliatesCommand(positionals[0], positionals.slice(1), flags, json);
      case "transactions":
        return await transactionsCommand(positionals[0], positionals.slice(1), flags, json);
      case "version":
        return versionCommand();
      case "help":
        return helpCommand();
      case undefined:
        writeStderr("Usage: agent-drive <onboard|whoami|logout|payments|purchase|items|listings|links|affiliates|transactions|version> [flags]. Run with --help for details.");
        return 2;
      default:
        writeStderr(`Unknown command "${command}". Run with --help for details.`);
        return 2;
    }
  } catch (err) {
    return reportError(err, json);
  }
}
