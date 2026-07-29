import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { CashDriveError, ConfigCorruptError } from "../errors.js";
import type { AgentProfile, StoredConfig } from "../types/agent.js";
import { configDir, configPath } from "./paths.js";

export { configDir, configPath };

const CURRENT_VERSION = 1 as const;

function emptyConfig(): StoredConfig {
  return { version: CURRENT_VERSION, currentProfile: "default", profiles: {} };
}

function mergeProfile(existing: AgentProfile, patch: Partial<AgentProfile>): AgentProfile {
  return {
    ...existing,
    ...patch,
    agent: patch.agent ? { ...existing.agent, ...patch.agent } : existing.agent,
    wallet: patch.wallet ? { ...existing.wallet, ...patch.wallet } : existing.wallet,
  };
}

/** Absent file -> null. Present but unparseable -> ConfigCorruptError, and the file is never touched. */
export async function readConfig(): Promise<StoredConfig | null> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigCorruptError(configPath(), { cause: err });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigCorruptError(configPath());
  }

  const config = parsed as Partial<StoredConfig>;
  if (config.version !== CURRENT_VERSION) {
    throw new CashDriveError(
      `The CashDrive config file at ${configPath()} has version ${String(config.version)}, which this SDK version does not understand. Upgrade the cash-drive package.`,
      "config_unsupported_version",
    );
  }
  if (typeof config.profiles !== "object" || config.profiles === null) {
    throw new ConfigCorruptError(configPath());
  }

  return {
    version: CURRENT_VERSION,
    currentProfile: config.currentProfile ?? "default",
    profiles: config.profiles,
  };
}

export async function readProfile(name?: string): Promise<AgentProfile | null> {
  const config = await readConfig();
  if (!config) return null;
  const profileName = name ?? config.currentProfile;
  return config.profiles[profileName] ?? null;
}

/** Temp file in the same directory, fsync, then rename over the target -- atomic on every supported platform. */
async function writeConfigAtomic(config: StoredConfig): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const target = configPath();
  const tmpPath = join(dir, `.config.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(config, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, target);

  try {
    const info = await stat(target);
    const mode = info.mode & 0o777;
    if (mode !== 0o600) {
      process.stderr.write(
        `[cash-drive] warning: could not set ${target} to mode 0600 (got ${mode.toString(8)}). Some filesystems and Windows ignore this.\n`,
      );
    }
  } catch {
    // Best-effort; the write itself already succeeded.
  }
}

export async function writeProfile(name: string, profile: AgentProfile): Promise<void> {
  const config = (await readConfig()) ?? emptyConfig();
  const isFirstProfile = Object.keys(config.profiles).length === 0;
  config.profiles[name] = profile;
  if (isFirstProfile) config.currentProfile = name;
  await writeConfigAtomic(config);
}

export async function patchProfile(name: string, patch: Partial<AgentProfile>): Promise<void> {
  const config = (await readConfig()) ?? emptyConfig();
  const existing = config.profiles[name];
  if (!existing) {
    throw new CashDriveError(`No profile named "${name}" exists in ${configPath()}.`, "profile_not_found");
  }
  config.profiles[name] = mergeProfile(existing, patch);
  await writeConfigAtomic(config);
}

export async function deleteProfile(name: string): Promise<void> {
  const config = await readConfig();
  if (!config) return;
  if (!(name in config.profiles)) return;

  const profiles = { ...config.profiles };
  delete profiles[name];
  const remaining = Object.keys(profiles);
  const currentProfile = config.currentProfile === name ? remaining[0] ?? "default" : config.currentProfile;

  await writeConfigAtomic({ version: CURRENT_VERSION, currentProfile, profiles });
}
