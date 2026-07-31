import { homedir } from "node:os";
import { join } from "node:path";

/** AGENTDRIVE_CONFIG_DIR -> $XDG_CONFIG_HOME/agent-drive -> ~/.agent-drive. Same path on every platform. */
export function configDir(): string {
  const override = process.env.AGENTDRIVE_CONFIG_DIR;
  if (override) return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "agent-drive");
  return join(homedir(), ".agent-drive");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}
