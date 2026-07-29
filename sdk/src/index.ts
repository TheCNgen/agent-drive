export { CashDrive, type CashDriveOptions } from "./client.js";
export { AgentResource, type RegisterWalletInput, type ActivateInput } from "./resources/agent.js";
export { ItemsResource } from "./resources/items.js";
export { ListingsResource } from "./resources/listings.js";
export { SharedLinksResource } from "./resources/sharedLinks.js";
export { AffiliatesResource } from "./resources/affiliates.js";
export { TransactionsResource } from "./resources/transactions.js";
export { redeemClaim, type RedeemClaimOptions } from "./auth/claim.js";
export { ApiKeyAuth } from "./auth/apiKey.js";
export { redactSecret, redactObject } from "./core/redact.js";
export { normalizePage, normalizeFakeTotalPagination, iteratePages, type Page, type FakeTotalPagination } from "./core/pagination.js";
export { isPopulated, refId } from "./types/common.js";
export {
  TINYBARS_PER_HBAR,
  hbarToTinybars,
  tinybarsToHbar,
  isValidTinybars,
  addTinybars,
  percentOfTinybars,
} from "./utils/hbar.js";
export { SDK_VERSION } from "./version.js";

export {
  CashDriveError,
  ValidationError,
  ClaimInvalidError,
  AuthenticationError,
  KeyRevokedError,
  MissingCredentialsError,
  InsufficientScopeError,
  AgentNotActiveError,
  ActivationError,
  NotFoundError,
  ConflictError,
  GoneError,
  PaymentRequiredError,
  ServerError,
  NetworkError,
  TimeoutError,
  ConfigCorruptError,
  isCashDriveError,
  type CashDriveErrorOptions,
} from "./errors.js";

export type {
  AgentIdentity,
  AgentStatus,
  OnboardingState,
  HederaNetwork,
  ApiConnectionInfo,
  WalletRequirement,
  OwnerInfo,
  ClaimResult,
  WalletInfo,
  WalletRegisterResult,
  MeResult,
  ActivateResult,
  RevokeResult,
  AgentProfile,
  StoredConfig,
  OnboardState,
} from "./types/agent.js";

export type {
  Logger,
  LogLevel,
  ApiErrorBody,
  JsonValue,
  ObjectId,
  ISODate,
  Tinybars,
  Ref,
  PopulatedItemRef,
  PopulatedUserRef,
} from "./types/common.js";

export type {
  Item,
  ItemType,
  ItemAiProcessing,
  AiProcessingStatus,
  ItemContentSource,
  Breadcrumb,
  ListItemsParams,
  CreateFolderInput,
  UploadItemInput,
  CreateItemFromUrlInput,
  UpdateItemInput,
  DeleteItemResult,
} from "./types/item.js";

export type {
  Listing,
  ListingStatus,
  ListListingsParams,
  CreateListingInput,
  UpdateListingInput,
  ListingPurchaseStatus,
  ListingPublicDetails,
} from "./types/listing.js";

export type {
  SharedLink,
  SharedLinkType,
  ListSharedLinksParams,
  CreateSharedLinkInput,
  SharedLinkAccessContent,
  SharedLinkAccess,
  SharedLinkDetailsLink,
  SharedLinkDetails,
  ClaimSharedLinkResult,
} from "./types/sharedLink.js";

export type {
  Affiliate,
  AffiliateStatus,
  AffiliateListingRef,
  AffiliateSharedLinkRef,
  ListAffiliatesParams,
  CreateAffiliateInput,
  UpdateAffiliateInput,
  AffiliateByCode,
  ListAffiliateCommissionsParams,
  Commission,
  AffiliateTransactionsSummaryEntry,
  AffiliateTransactionsSummary,
  AffiliateTransactionsPage,
  UpdateCommissionInput,
  UpdateCommissionResult,
} from "./types/affiliate.js";

export type {
  Transaction,
  TransactionStatus,
  TransactionKind,
  PaymentFlow,
  TransactionRole,
  TransactionWithRole,
  PopulatedListingRef,
  PopulatedSharedLinkRef,
  PopulatedParentTransactionRef,
  AffiliateCommissionDistribution,
  TransactionAffiliateInfo,
  ListTransactionsParams,
  CommissionsReportParams,
  CommissionsReportSummary,
  CommissionsReport,
  EarningsReportParams,
  EarningsBucket,
  EarningsSummary,
  EarningsReport,
  UnsafeUpdateTransactionInput,
  UnsafeUpdateTransactionResult,
} from "./types/transaction.js";

export type { FileLike } from "./utils/file.js";
