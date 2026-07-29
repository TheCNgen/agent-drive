export { CashDrive, type CashDriveOptions } from "./client.js";
export { AgentResource, type RegisterWalletInput, type ActivateInput } from "./resources/agent.js";
export { redeemClaim, type RedeemClaimOptions } from "./auth/claim.js";
export { ApiKeyAuth } from "./auth/apiKey.js";
export { redactSecret, redactObject } from "./core/redact.js";
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

export type { Logger, LogLevel, ApiErrorBody, JsonValue } from "./types/common.js";
