import { AgentDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

export async function purchaseCommand(
  targetType: string | undefined,
  targetId: string | undefined,
  flags: Record<string, FlagValue>,
  json: boolean,
): Promise<number> {
  if (targetType !== "listing" && targetType !== "link") {
    writeStderr(`Usage: agent-drive purchase <listing|link> <id> [--affiliate <code>] [--json]`);
    return 2;
  }
  if (!targetId) {
    writeStderr(`Error: Missing <id> argument for ${targetType}`);
    writeStderr(`Usage: agent-drive purchase <listing|link> <id> [--affiliate <code>] [--json]`);
    return 2;
  }

  const profileName = flagString(flags, "profile");
  const affiliateCode = flagString(flags, "affiliate");

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
    if (targetType === "listing") {
      const result = await client.listings.purchase(targetId, {
        ...(affiliateCode ? { affiliateCode } : {}),
        onQuote: (quote) => {
          if (!json) writeStdout(`Paying ${quote.priceTinybars} tinybars...`);
        },
      });
      if (json) {
        writeJsonLine({ ok: true, result });
      } else {
        writeStdout(`Successfully purchased listing! Transaction: ${result.paymentDetails.transaction}`);
        if (!result.affiliateApplied && affiliateCode) {
          writeStdout(`Note: Affiliate code was rejected or not applied.`);
        }
      }
    } else {
      const result = await client.sharedLinks.purchaseAndClaim(targetId, {
        ...(affiliateCode ? { affiliateCode } : {}),
        onQuote: (quote) => {
          if (!json) writeStdout(`Paying ${quote.priceTinybars} tinybars...`);
        },
      });
      if (json) {
        writeJsonLine({ ok: true, result });
      } else {
        const purchaseTx = result.purchase ? result.purchase.paymentDetails.transaction : "already paid";
        writeStdout(`Successfully purchased and claimed shared link! Transaction: ${purchaseTx}`);
        if (result.purchase && !result.purchase.affiliateApplied && affiliateCode) {
          writeStdout(`Note: Affiliate code was rejected or not applied.`);
        }
      }
    }

    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
