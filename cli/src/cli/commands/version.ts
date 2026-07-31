import { SDK_VERSION } from "../../version.js";
import { writeStdout } from "../output.js";

export function versionCommand(): number {
  writeStdout(`agent-drive ${SDK_VERSION}`);
  return 0;
}

export function helpCommand(): number {
  writeStdout(
    [
      "agent-drive -- AgentDrive SDK CLI for AI agents",
      "",
      "Usage:",
      "  agent-drive onboard --claim <hex> [--base-url <url>] [--profile <name>] [--no-wait] [--json]",
      "  agent-drive onboard --resume [--profile <name>] [--json]",
      "  agent-drive whoami [--profile <name>] [--json]",
      "  agent-drive logout [--profile <name>] [--all] [--yes] [--force] [--json]",
      "  agent-drive payments recover [--profile <name>] [--json]",
      "  agent-drive --version | --help",
    ].join("\n"),
  );
  return 0;
}
