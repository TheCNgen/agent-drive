import { MissingCredentialsError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://app.agentdrive.io";
export const DEFAULT_API_PREFIX = "/api";

export interface CredentialInputs {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  apiPrefix?: string | undefined;
  profile?: string | undefined;
}

export interface ResolvedConnection {
  apiKey: string;
  baseUrl: string;
  apiPrefix: string;
}

export function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
}

function env(name: string): string | undefined {
  if (!isNodeRuntime()) return undefined;
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

interface FileProfileConnection {
  apiKey: string;
  baseUrl: string;
  apiPrefix: string;
}

/**
 * Reads the on-disk profile, in Node only. The import is dynamic and gated behind
 * isNodeRuntime() so a browser build never reaches the `node:fs` dependency it pulls in.
 */
async function readFileProfileConnection(profileName: string | undefined): Promise<FileProfileConnection | null> {
  if (!isNodeRuntime()) return null;
  const mod = await import("./agent/configStore.js");
  const profile = await mod.readProfile(profileName);
  if (!profile) return null;
  return { apiKey: profile.apiKey, baseUrl: profile.baseUrl, apiPrefix: profile.apiPrefix };
}

/**
 * Resolves apiKey/baseUrl/apiPrefix independently, each through its own
 * options -> env -> on-disk-profile chain. First hit wins per field; sources are never merged.
 */
export async function resolveConnection(inputs: CredentialInputs): Promise<ResolvedConnection> {
  let apiKey = inputs.apiKey ?? env("AGENTDRIVE_API_KEY");
  let baseUrl = inputs.baseUrl ?? env("AGENTDRIVE_BASE_URL");
  let apiPrefix = inputs.apiPrefix;

  if (apiKey === undefined || baseUrl === undefined || apiPrefix === undefined) {
    const profileName = inputs.profile ?? env("AGENTDRIVE_PROFILE");
    const fileConnection = await readFileProfileConnection(profileName);
    if (fileConnection) {
      apiKey = apiKey ?? fileConnection.apiKey;
      baseUrl = baseUrl ?? fileConnection.baseUrl;
      apiPrefix = apiPrefix ?? fileConnection.apiPrefix;
    }
  }

  if (apiKey === undefined) {
    throw new MissingCredentialsError();
  }

  return {
    apiKey,
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    apiPrefix: apiPrefix ?? DEFAULT_API_PREFIX,
  };
}
