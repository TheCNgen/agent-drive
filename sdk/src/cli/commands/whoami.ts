import { CashDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, tinybarsToHbar, writeJsonLine, writeStdout } from "../output.js";

export async function whoamiCommand(flags: Record<string, FlagValue>, json: boolean): Promise<number> {
  const profileName = flagString(flags, "profile");
  const profile = await readProfile(profileName);

  if (!profile) {
    return reportError(new MissingCredentialsError(), json);
  }

  const client = new CashDrive({
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    apiPrefix: profile.apiPrefix,
  });

  try {
    const me = await client.agent.me();
    const balanceHbar = tinybarsToHbar(me.wallet.balanceTinybars);

    if (json) {
      writeJsonLine({ ok: true, agent: me.agent, wallet: { ...me.wallet, balanceHbar }, owner: me.owner });
      return 0;
    }

    writeStdout(`Agent        ${me.agent.name} (${me.agent.id})`);
    writeStdout(`Status       ${me.agent.status}`);
    writeStdout(`Onboarding   ${me.agent.onboardingState}`);
    writeStdout(`Wallet       ${me.wallet.evmAddress}`);
    writeStdout(`Account      ${me.wallet.accountId ?? "(none yet -- not funded)"}`);
    writeStdout(`Balance      ${balanceHbar} ℏ (${me.wallet.balanceTinybars} tinybars)`);

    if (me.agent.onboardingState !== "active") {
      writeStdout("");
      writeStdout(`Onboarding is incomplete (state: ${me.agent.onboardingState}). Run \`cash-drive onboard --resume\` to continue.`);
    }
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
