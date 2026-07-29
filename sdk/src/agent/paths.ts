import { homedir } from "node:os";
import { join } from "node:path";

/** CASHDRIVE_CONFIG_DIR -> $XDG_CONFIG_HOME/cash-drive -> ~/.cash-drive. Same path on every platform. */
export function configDir(): string {
  const override = process.env.CASHDRIVE_CONFIG_DIR;
  if (override) return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "cash-drive");
  return join(homedir(), ".cash-drive");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}
