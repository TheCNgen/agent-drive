import type { HttpClient } from "../core/http.js";
import { iteratePages, normalizePage, type Page } from "../core/pagination.js";
import { ConflictError, ValidationError } from "../errors.js";
import { executePurchase } from "./payments.js";
import { isValidTinybars } from "../utils/hbar.js";
import type { Logger } from "../types/common.js";
import type { PurchaseOptions, PurchaseResult } from "../types/payment.js";
import type {
  ClaimSharedLinkResult,
  CreateSharedLinkInput,
  ListSharedLinksParams,
  SharedLink,
  SharedLinkAccess,
  SharedLinkDetails,
} from "../types/sharedLink.js";

const DEFAULT_LIST_LIMIT = 20;

export class SharedLinksResource {
  constructor(
    private readonly getHttp: () => Promise<HttpClient>,
    private readonly logger: Logger,
    private readonly profileName: string | undefined,
  ) {}

  /**
   * Lists your shared links. **Requires `sharedlinks:read`.**
   *
   * @example
   * const page = await client.sharedLinks.list({ type: "monetized" });
   */
  async list(params: ListSharedLinksParams = {}): Promise<Page<SharedLink>> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<unknown>("GET", "/shared-links", {
      query: { type: params.type, page: params.page, limit },
    });
    return normalizePage<SharedLink>(raw, "links", limit);
  }

  /** Async-generator form of {@link list}. */
  async *iterate(params: ListSharedLinksParams = {}): AsyncGenerator<SharedLink> {
    yield* iteratePages<SharedLink>(
      (p) => this.list(p as ListSharedLinksParams),
      params as Record<string, unknown>,
    );
  }

  /**
   * Creates a shared link for an item you own. **Requires `sharedlinks:write`.**
   *
   * Sends both `price` and `priceTinybars` (the same value) plus `affiliateEnabled`. The
   * creation route currently only persists `price`; the purchase route only reads
   * `priceTinybars` — a backend defect (see stage-3-summary.md §7.3) that makes every
   * monetized link created through the plain creation payload unpurchasable. Sending
   * both fields is the only way an API-created link stays purchasable today, and remains
   * correct once the backend unifies on `priceTinybars`: Mongoose strict mode silently
   * drops whichever field the schema doesn't have.
   *
   * @example
   * const link = await client.sharedLinks.create({
   *   itemId, type: "monetized", title: "My file", priceTinybars: "100000000",
   * });
   */
  async create(input: CreateSharedLinkInput): Promise<SharedLink> {
    if (input.type === "monetized") {
      if (!input.priceTinybars || !isValidTinybars(input.priceTinybars)) {
        throw new ValidationError(
          `A monetized link requires priceTinybars matching /^[1-9][0-9]*$/, got "${String(input.priceTinybars)}".`,
        );
      }
    } else if (input.priceTinybars !== undefined) {
      throw new ValidationError('A "public" shared link must not set priceTinybars.');
    }

    const body: Record<string, unknown> = {
      itemId: input.itemId,
      type: input.type,
      title: input.title,
      description: input.description,
      expiresAt: input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt,
      affiliateEnabled: input.affiliateEnabled,
    };
    if (input.priceTinybars !== undefined) {
      // See §7.3: send both until the backend unifies on priceTinybars.
      body.price = Number(input.priceTinybars);
      body.priceTinybars = input.priceTinybars;
    }

    const http = await this.getHttp();
    return http.request<SharedLink>("POST", "/shared-links", { body });
  }

  /**
   * Accesses a shared link, incrementing its view counter as a side effect. **Optional
   * auth** — works either way, but `canAccess`/`requiresPayment`/`requiresAuth` in the
   * response differ depending on whether you're authenticated and have paid.
   *
   * @example
   * const access = await client.sharedLinks.access(linkId);
   */
  async access(linkId: string): Promise<SharedLinkAccess> {
    const http = await this.getHttp();
    return http.request<SharedLinkAccess>("GET", `/shared-links/${encodeURIComponent(linkId)}`);
  }

  /**
   * Public/optional-auth details for a shared link. **Optional auth.**
   *
   * `alreadyPaid` is hardcoded to `false` on the backend (a literal `// TODO`) — never
   * trust it to reflect real payment state.
   *
   * @example
   * const { link, canAccess } = await client.sharedLinks.getDetails(linkId);
   */
  async getDetails(linkId: string): Promise<SharedLinkDetails> {
    const http = await this.getHttp();
    const raw = await http.request<{ sharedLink: SharedLinkDetails }>(
      "GET",
      `/shared-links/${encodeURIComponent(linkId)}/details`,
    );
    return raw.sharedLink;
  }

  /**
   * Claims a shared link, copying its item into your drive. **Requires `sharedlinks:write`.**
   *
   * Throws `GoneError` if the link expired, `NotFoundError` if it's missing or inactive,
   * and `PaymentRequiredError` if it's monetized and you haven't paid yet — purchase it
   * (Stage 4) and claim again.
   *
   * @example
   * const { copiedItem } = await client.sharedLinks.claim(linkId);
   */
  async claim(linkId: string): Promise<ClaimSharedLinkResult> {
    const http = await this.getHttp();
    return http.request<ClaimSharedLinkResult>("POST", `/shared-links/${encodeURIComponent(linkId)}`, {
      body: {},
    });
  }

  /**
   * Buys a monetized shared link over x402. **Unlike a listing purchase, this alone does
   * not copy anything into your drive** - a successful purchase only marks the link paid;
   * call {@link claim} separately, or use {@link purchaseAndClaim} to do both. Requires
   * `payments:spend` and an activated agent account.
   *
   * **The on-chain transfer settles the full price to the platform treasury, not the
   * seller** - see `listings.purchase`'s doc for the ledger-vs-settlement distinction, which
   * applies identically here.
   *
   * @example
   * await client.sharedLinks.purchase(linkId);
   * const { copiedItem } = await client.sharedLinks.claim(linkId);
   */
  async purchase(linkId: string, options: PurchaseOptions = {}): Promise<PurchaseResult> {
    return executePurchase(
      { getHttp: this.getHttp, logger: this.logger, profileName: this.profileName },
      { type: "sharedLink", linkId },
      options,
    );
  }

  /**
   * Runs {@link purchase} then {@link claim} sequentially - the common case, since a
   * purchase alone leaves the agent paid-up but without the file. The purchase leg is never
   * retried (stage doc §4.4); if it fails because the content was already paid for in a
   * prior, partial run (`ConflictError`), that state is recoverable and this skips straight
   * to claiming rather than treating it as a hard failure.
   *
   * @example
   * const { claim } = await client.sharedLinks.purchaseAndClaim(linkId);
   */
  async purchaseAndClaim(
    linkId: string,
    options: PurchaseOptions = {},
  ): Promise<{ purchase: PurchaseResult | null; claim: ClaimSharedLinkResult }> {
    let purchase: PurchaseResult | null = null;
    try {
      purchase = await this.purchase(linkId, options);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      this.logger.info(`Already paid for shared link "${linkId}" - skipping straight to claim.`);
    }
    const claim = await this.claim(linkId);
    return { purchase, claim };
  }
}
