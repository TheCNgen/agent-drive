import { onboard } from "../../agent/onboard.js";
import { configPath } from "../../agent/configStore.js";
import { redactObject } from "../../core/redact.js";
import type { OnboardState } from "../../types/agent.js";
import { flagBoolean, flagString, type FlagValue } from "../run.js";
import { tinybarsToHbar, writeJsonLine, writeStderr, writeStdout } from "../output.js";

const DEFAULT_PROFILE_NAME = "default";

function printFundingInstructions(evmAddress: string, suggestedFundingTinybars: string): void {
  const hbar = tinybarsToHbar(suggestedFundingTinybars);
  writeStderr("");
  writeStderr("Fund this agent to activate it:");
  writeStderr("");
  writeStderr(`  EVM address   ${evmAddress}`);
  writeStderr("  Network       Hedera testnet");
  writeStderr(`  Suggested     ${hbar} ℏ  (${suggestedFundingTinybars} tinybars)`);
  writeStderr("");
  writeStderr(`  hcli account transfer --to ${evmAddress} --amount ${hbar}`);
  writeStderr("");
  writeStderr("Your operator dashboard shows this live. Waiting for funds…");
  writeStderr("");
}

function createHumanStateHandler(): (state: OnboardState) => void {
  let remindedSlowFunding = false;
  let fundingLineOpen = false;

  return (state: OnboardState) => {
    switch (state.state) {
      case "claiming":
        writeStderr("◐ Redeeming claim code…");
        break;
      case "claimed":
        writeStderr(`✓ Claimed as ${state.agent.name}`);
        break;
      case "wallet_generated":
        writeStderr("◐ Generating wallet…");
        writeStderr(`✓ Wallet ${state.evmAddress}`);
        break;
      case "wallet_registered":
        writeStderr("✓ Registered with CashDrive");
        printFundingInstructions(state.evmAddress, state.suggestedFundingTinybars);
        break;
      case "awaiting_funding": {
        const seconds = Math.round(state.elapsedMs / 1000);
        const line = `◐ Waiting for funds… ${seconds}s`;
        if (process.stderr.isTTY) {
          process.stderr.write(`\r${line}`.padEnd(60));
          fundingLineOpen = true;
        } else {
          writeStderr(line);
        }
        if (state.elapsedMs >= 60_000 && !remindedSlowFunding) {
          remindedSlowFunding = true;
          if (fundingLineOpen) {
            process.stderr.write("\n");
            fundingLineOpen = false;
          }
          writeStderr("Ctrl-C is safe -- run `cash-drive onboard --resume` to continue later.");
        }
        break;
      }
      case "funded":
        if (fundingLineOpen) {
          process.stderr.write("\n");
          fundingLineOpen = false;
        }
        writeStderr(`✓ Funded — account ${state.accountId} (${tinybarsToHbar(state.balanceTinybars)} ℏ)`);
        break;
      case "activating":
        writeStderr("◐ Activating account…");
        break;
      case "active":
        writeStderr("✓ Agent is active");
        break;
    }
  };
}

export async function onboardCommand(flags: Record<string, FlagValue>, json: boolean): Promise<number> {
  const resume = flagBoolean(flags, "resume");
  const claimCode = flagString(flags, "claim");
  const baseUrl = flagString(flags, "base-url");
  const profileName = flagString(flags, "profile") ?? DEFAULT_PROFILE_NAME;
  const noWait = flagBoolean(flags, "no-wait");

  if (!resume && !claimCode) {
    writeStderr("Provide --claim <hex> or --resume. Run with --help for details.");
    return 2;
  }

  const onState = json ? (state: OnboardState) => writeJsonLine(state) : createHumanStateHandler();

  const profile = await onboard({
    claimCode,
    resume,
    baseUrl,
    profile: profileName,
    waitForFunding: !noWait,
    onState,
  });

  const isActive = profile.agent.onboardingState === "active";

  if (json) {
    writeJsonLine({ ok: true, profile: redactObject(profile) });
    return 0;
  }

  writeStdout("");
  if (isActive) {
    writeStdout(`Saved to ${configPath()} (profile: ${profileName})`);
  } else if (noWait) {
    writeStdout("Wallet registered but not yet funded. Fund the address above, then run `cash-drive onboard --resume`.");
    writeStdout(`Progress saved to ${configPath()} (profile: ${profileName})`);
  } else {
    writeStdout("Timed out waiting for funding. Run `cash-drive onboard --resume` once the wallet is funded.");
    writeStdout(`Progress saved to ${configPath()} (profile: ${profileName})`);
  }

  return 0;
}
