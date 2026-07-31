import type { AuthStrategy } from "../core/http.js";
import { SDK_VERSION } from "../version.js";

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
}

function buildUserAgent(): string {
  const nodeVersion = process.versions.node;
  return `agent-drive/${SDK_VERSION} node/${nodeVersion} ${process.platform}`;
}

export class ApiKeyAuth implements AuthStrategy {
  constructor(private readonly apiKey: string) {}

  prepare(headers: Headers): void {
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    // User-Agent is a forbidden header in browsers; setting it there just warns on every request.
    if (isNodeRuntime()) {
      headers.set("User-Agent", buildUserAgent());
    }
  }
}
