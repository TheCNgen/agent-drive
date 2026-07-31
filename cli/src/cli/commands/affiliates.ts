import { AgentDrive } from "../../client.js";
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

  const client = new AgentDrive({
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
      case "create": {
        const listingId = flagString(flags, "listing");
        const sharedLinkId = flagString(flags, "link");
        const input: any = { affiliateUserId: positionals[0]! };
        if (listingId) input.listingId = listingId;
        if (sharedLinkId) input.sharedLinkId = sharedLinkId;
        result = await client.affiliates.create(input);
        break;
      }
      default:
        writeStderr(`Usage: agent-drive affiliates <list|create> [args]`);
        return 2;
    }

    if (json) writeJsonLine({ ok: true, result });
    else writeStdout(JSON.stringify(result, null, 2));
    
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
