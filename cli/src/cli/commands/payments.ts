import { AgentDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

async function recoverCommand(flags: Record<string, FlagValue>, json: boolean): Promise<number> {
  const profileName = flagString(flags, "profile");
  const profile = await readProfile(profileName);
  if (!profile) {
    return reportError(new MissingCredentialsError(), json);
  }

  const client = new AgentDrive({
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    apiPrefix: profile.apiPrefix,
    profile: profileName,
  });

  try {
    const results = await client.payments.recoverPending();

    if (json) {
      if (results.length === 0) {
        writeJsonLine({ ok: true, results: [] });
      } else {
        for (const result of results) writeJsonLine({ ok: true, ...result });
      }
      return results.some((r) => r.outcome === "needs_investigation") ? 1 : 0;
    }

    if (results.length === 0) {
      writeStdout("No pending payments.");
      return 0;
    }

    let needsInvestigation = 0;
    for (const result of results) {
      writeStdout(`[${result.outcome}] ${result.quoteId} (${result.priceTinybars} tinybars) - ${result.message}`);
      if (result.outcome === "needs_investigation") needsInvestigation++;
    }
    return needsInvestigation > 0 ? 1 : 0;
  } catch (err) {
    return reportError(err, json);
  }
}

export async function paymentsCommand(
  subcommand: string | undefined,
  flags: Record<string, FlagValue>,
  json: boolean,
): Promise<number> {
  switch (subcommand) {
    case "recover":
      return recoverCommand(flags, json);
    default:
      writeStderr(`Usage: agent-drive payments recover [--profile <name>] [--json]`);
      return 2;
  }
}
