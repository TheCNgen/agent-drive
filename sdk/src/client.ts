import { HttpClient } from "./core/http.js";
import { ApiKeyAuth } from "./auth/apiKey.js";
import { resolveConnection } from "./config.js";
import { resolveLogger } from "./core/logger.js";
import { AgentResource } from "./resources/agent.js";
import type { Logger, LogLevel } from "./types/common.js";

export interface CashDriveOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  apiPrefix?: string | undefined;
  profile?: string | undefined;
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  logger?: Logger | LogLevel | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export class CashDrive {
  readonly agent: AgentResource;
  private readonly options: CashDriveOptions;
  private httpClientPromise: Promise<HttpClient> | undefined;

  constructor(options: CashDriveOptions = {}) {
    this.options = options;
    this.agent = new AgentResource(() => this.getHttpClient());
  }

  private getHttpClient(): Promise<HttpClient> {
    if (!this.httpClientPromise) {
      this.httpClientPromise = this.buildHttpClient();
    }
    return this.httpClientPromise;
  }

  private async buildHttpClient(): Promise<HttpClient> {
    const connection = await resolveConnection({
      apiKey: this.options.apiKey,
      baseUrl: this.options.baseUrl,
      apiPrefix: this.options.apiPrefix,
      profile: this.options.profile,
    });

    return new HttpClient({
      baseUrl: connection.baseUrl,
      apiPrefix: connection.apiPrefix,
      fetchImpl: this.options.fetch ?? globalThis.fetch,
      timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: this.options.maxRetries ?? DEFAULT_MAX_RETRIES,
      logger: resolveLogger(this.options.logger),
      auth: new ApiKeyAuth(connection.apiKey),
    });
  }
}
