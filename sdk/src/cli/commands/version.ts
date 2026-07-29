import { SDK_VERSION } from "../../version.js";
import { writeStdout } from "../output.js";

export function versionCommand(): number {
  writeStdout(`cash-drive ${SDK_VERSION}`);
  return 0;
}

export function helpCommand(): number {
  writeStdout(
    [
      "cash-drive -- CashDrive SDK CLI for AI agents",
      "",
      "Usage:",
      "  cash-drive onboard --claim <hex> [--base-url <url>] [--profile <name>] [--no-wait] [--json]",
      "  cash-drive onboard --resume [--profile <name>] [--json]",
      "  cash-drive whoami [--profile <name>] [--json]",
      "  cash-drive logout [--profile <name>] [--all] [--yes] [--force] [--json]",
      "  cash-drive payments recover [--profile <name>] [--json]",
      "  cash-drive --version | --help",
    ].join("\n"),
  );
  return 0;
}
