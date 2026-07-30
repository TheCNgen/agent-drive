import { CashDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

export async function listingsCommand(
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
        result = await client.listings.list({ status: flagString(flags, "status") as any });
        break;
      case "get":
        result = await client.listings.get(positionals[0]!);
        break;
      case "create":
        result = await client.listings.create({ 
          itemId: positionals[0]!, 
          title: flagString(flags, "title") || "Untitled",
          description: flagString(flags, "desc") || "",
          priceTinybars: flagString(flags, "price") || "0",
          affiliateEnabled: flags["affiliate-enabled"] === true
        });
        break;
      case "delete":
        result = await client.listings.delete(positionals[0]!);
        break;
      default:
        writeStderr(`Usage: cash-drive listings <list|get|create|delete> [args]`);
        return 2;
    }

    if (json) writeJsonLine({ ok: true, result });
    else writeStdout(JSON.stringify(result, null, 2));
    
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
