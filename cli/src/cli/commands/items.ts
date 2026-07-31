import { AgentDrive } from "../../client.js";
import { readProfile } from "../../agent/configStore.js";
import { MissingCredentialsError } from "../../errors.js";
import { flagString, type FlagValue } from "../run.js";
import { reportError, writeJsonLine, writeStderr, writeStdout } from "../output.js";

export async function itemsCommand(
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
      case "list": {
        const parentId = flagString(flags, "parent");
        result = await client.items.list(parentId ? { parentId } : {});
        break;
      }
      case "get":
        result = await client.items.get(positionals[0]!);
        break;
      case "create-folder": {
        const parentId = flagString(flags, "parent");
        result = await client.items.createFolder({ 
          name: positionals[0]!, 
          ...(parentId ? { parentId } : {}) 
        });
        break;
      }
      case "upload": {
        const { fileFromPath } = await import("../../node.js");
        const file = await fileFromPath(positionals[0]!);
        const parentIdUpload = flagString(flags, "parent");
        result = await client.items.upload({ 
          file, 
          name: positionals[1] || file.name, 
          ...(parentIdUpload ? { parentId: parentIdUpload } : {}) 
        });
        break;
      }
      case "delete":
        result = await client.items.delete(positionals[0]!);
        break;
      case "download": {
        const item = await client.items.get(positionals[0]!);
        if (!item.url) throw new Error("Item is not a file or has no download URL.");
        const dest = positionals[1] || item.name;
        const fs = await import("fs");
        const fetchResponse = await fetch(item.url);
        if (!fetchResponse.ok) throw new Error(`Failed to download: ${fetchResponse.statusText}`);
        const arrayBuffer = await fetchResponse.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(arrayBuffer));
        result = { downloadedTo: dest };
        if (!json) writeStdout(`Successfully downloaded to ${dest}`);
        break;
      }
      default:
        writeStderr(`Usage: agent-drive items <list|get|create-folder|upload|delete|download> [args]`);
        return 2;
    }

    if (json) writeJsonLine({ ok: true, result });
    else writeStdout(JSON.stringify(result, null, 2));
    
    return 0;
  } catch (err) {
    return reportError(err, json);
  }
}
