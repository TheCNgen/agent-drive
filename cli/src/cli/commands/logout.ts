import { createInterface } from "node:readline/promises";
import { AgentDrive } from "../../client.js";
import { deleteProfile, readConfig } from "../../agent/configStore.js";
import type { AgentProfile } from "../../types/agent.js";
import { flagBoolean, flagString, type FlagValue } from "../run.js";
import { tinybarsToHbar, writeJsonLine, writeStderr, writeStdout } from "../output.js";

async function fetchBalanceTinybars(profile: AgentProfile): Promise<string | null> {
  try {
    const client = new AgentDrive({ apiKey: profile.apiKey, baseUrl: profile.baseUrl, apiPrefix: profile.apiPrefix });
    const me = await client.agent.me();
    return me.wallet.balanceTinybars;
  } catch {
    return null;
  }
}

async function confirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${promptText} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** Deletes a profile and its private key. Refuses on a nonzero (or unreachable) balance without --force. */
export async function logoutCommand(flags: Record<string, FlagValue>, json: boolean): Promise<number> {
  const yes = flagBoolean(flags, "yes");
  const force = flagBoolean(flags, "force");
  const all = flagBoolean(flags, "all");
  const profileName = flagString(flags, "profile");

  if (!process.stdout.isTTY && !yes) {
    writeStderr("--yes is required when stdout is not a TTY.");
    return 2;
  }

  const config = await readConfig();
  if (!config) {
    if (json) writeJsonLine({ ok: true, removed: [] });
    else writeStdout("No AgentDrive config found; nothing to do.");
    return 0;
  }

  const targets = all ? Object.keys(config.profiles) : [profileName ?? config.currentProfile];
  const removed: string[] = [];

  for (const name of targets) {
    const profile = config.profiles[name];
    if (!profile) {
      writeStderr(`No profile named "${name}".`);
      continue;
    }

    const balanceTinybars = profile.wallet ? await fetchBalanceTinybars(profile) : "0";
    const isRisky = balanceTinybars === null || balanceTinybars !== "0";

    if (isRisky && !force) {
      const address = profile.wallet?.evmAddress ?? "(no wallet)";
      const balanceDisplay = balanceTinybars === null ? "unknown (could not reach backend)" : `${tinybarsToHbar(balanceTinybars)} ℏ`;
      writeStderr(`Profile "${name}" wallet ${address} has a balance of ${balanceDisplay}. Refusing to delete without --force.`);
      continue;
    }

    if (!yes) {
      const address = profile.wallet?.evmAddress ?? "(no wallet)";
      const balanceDisplay = balanceTinybars === null ? "unknown" : `${tinybarsToHbar(balanceTinybars)} ℏ`;
      writeStderr(`Profile "${name}" -- wallet ${address}, balance ${balanceDisplay}.`);
      const ok = await confirm("Delete this profile and its private key?");
      if (!ok) {
        writeStderr(`Skipped "${name}".`);
        continue;
      }
    }

    await deleteProfile(name);
    removed.push(name);
  }

  if (json) {
    writeJsonLine({ ok: true, removed });
  } else {
    writeStdout(removed.length > 0 ? `Removed profile(s): ${removed.join(", ")}` : "No profiles removed.");
  }
  return 0;
}
