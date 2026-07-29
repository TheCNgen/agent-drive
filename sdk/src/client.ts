import { HttpClient } from "./core/http.js";
import { ApiKeyAuth } from "./auth/apiKey.js";
import { resolveConnection } from "./config.js";
import { resolveLogger } from "./core/logger.js";
import { AgentResource } from "./resources/agent.js";
import { ItemsResource } from "./resources/items.js";
import { ListingsResource } from "./resources/listings.js";
import { SharedLinksResource } from "./resources/sharedLinks.js";
import { AffiliatesResource } from "./resources/affiliates.js";
import { TransactionsResource } from "./resources/transactions.js";
import { PaymentsResource } from "./resources/payments.js";
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
  readonly items: ItemsResource;
  readonly listings: ListingsResource;
  readonly sharedLinks: SharedLinksResource;
  readonly affiliates: AffiliatesResource;
  readonly transactions: TransactionsResource;
  /**
   * Node-only in practice: signing a payment needs the active profile's local key material.
   * Present on this class either way (it's shared between the `cash-drive` and
   * `cash-drive/agent` entries), but its types/errors are exported only from
   * `cash-drive/agent` and every method throws a clear error outside Node.
   */
  readonly payments: PaymentsResource;
  private readonly options: CashDriveOptions;
  private readonly logger: Logger;
  private httpClientPromise: Promise<HttpClient> | undefined;

  constructor(options: CashDriveOptions = {}) {
    this.options = options;
    this.logger = resolveLogger(options.logger);
    const getHttp = (): Promise<HttpClient> => this.getHttpClient();
    this.agent = new AgentResource(getHttp);
    this.items = new ItemsResource(getHttp);
    this.listings = new ListingsResource(getHttp, this.logger, options.profile);
    this.sharedLinks = new SharedLinksResource(getHttp, this.logger, options.profile);
    this.affiliates = new AffiliatesResource(getHttp, this.logger);
    this.transactions = new TransactionsResource(getHttp, this.logger);
    this.payments = new PaymentsResource(getHttp, this.logger, options.profile);
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
      logger: this.logger,
      auth: new ApiKeyAuth(connection.apiKey),
    });
  }
}
