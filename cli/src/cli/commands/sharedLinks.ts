import { AgentDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

export async function sharedLinksCommand(
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
        result = await client.sharedLinks.list({ type: flagString(flags, "type") as any });
        break;
      case "create": {
        const priceTinybars = flagString(flags, "price");
        result = await client.sharedLinks.create({ 
          itemId: positionals[0]!,
          type: (flagString(flags, "type") as any) || "public",
          title: flagString(flags, "title") || "Untitled",
          ...(priceTinybars ? { priceTinybars } : {})
        });
        break;
      }
      case "claim":
        result = await client.sharedLinks.claim(positionals[0]!);
        break;
      default:
        writeStderr(`Usage: agent-drive links <list|create|claim> [args]`);
        return 2;
    }

    if (json) writeJsonLine({ ok: true, result });
    else writeStdout(JSON.stringify(result, null, 2));
    
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
