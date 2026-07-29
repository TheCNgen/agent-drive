import { CashDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

export async function affiliatesCommand(
  subcommand: string | undefined,
  positionals: string[],
  flags: Record<string, FlagValue>,
  json: boolean,
): Promise<number> {
  const profileName = flagString(flags, "profile");
  const profile = await readProfile(profileName);
  if (!profile) return reportError(new MissingCredentialsError(), json);

  const client = new CashDrive({
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    apiPrefix: profile.apiPrefix,
    profile: profileName,
  });

  try {
    let result: any;
    switch (subcommand) {
      case "list":
        result = await client.affiliates.list();
        break;
      case "create":
        result = await client.affiliates.create({ 
          listingId: flagString(flags, "listing"),
          sharedLinkId: flagString(flags, "link"),
          affiliateUserId: positionals[0]!
        });
        break;
      default:
        writeStderr(`Usage: cash-drive affiliates <list|create> [args]`);
        return 2;
    }

    if (json) writeJsonLine({ ok: true, result });
    else writeStdout(JSON.stringify(result, null, 2));
    
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
