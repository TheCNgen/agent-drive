export { configDir, configPath, readConfig, readProfile, writeProfile, patchProfile, deleteProfile } from "./agent/configStore.js";
export { generateWallet, loadWallet, isValidEvmAddress, type GeneratedWallet } from "./agent/wallet.js";
export { activateAccount, ACTIVATION_RETRY_MESSAGE, type ActivateAccountOptions, type ActivateAccountResult } from "./agent/activate.js";
export { onboard, type OnboardOptions } from "./agent/onboard.js";
export { LocalKeySigner } from "./agent/paymentSigner.js";
export {
  pendingDir,
  listPendingEntries,
  hasPendingEntries,
  deletePendingEntry,
  writePendingEntry,
} from "./agent/paymentJournal.js";

export { CashDrive, type CashDriveOptions } from "./client.js";
export { PaymentsResource } from "./resources/payments.js";
export {
  CashDriveError,
  ValidationError,
  ClaimInvalidError,
  AuthenticationError,
  KeyRevokedError,
  MissingCredentialsError,
  InsufficientScopeError,
  AgentNotActiveError,
  AgentNotActivatedError,
  ActivationError,
  NotFoundError,
  ConflictError,
  GoneError,
  PaymentRequiredError,
  InsufficientBalanceError,
  PriceChangedError,
  FacilitatorUnavailableError,
  PaymentVerificationError,
  SettlementFailedError,
  ServerError,
  NetworkError,
  TimeoutError,
  ConfigCorruptError,
  isCashDriveError,
} from "./errors.js";

export type {
  AgentIdentity,
  AgentStatus,
  OnboardingState,
  HederaNetwork,
  AgentProfile,
  StoredConfig,
  OnboardState,
  WalletInfo,
} from "./types/agent.js";

export type {
  PaymentSigner,
  PurchaseTarget,
  PaymentQuote,
  PaymentQuoteBreakdown,
  PaymentQuoteAffiliate,
  Balance,
  PurchaseOptions,
  PurchaseResult,
  PendingPaymentEntry,
  RecoveryResult,
  XPaymentRequirements,
  XPaymentPayload,
} from "./types/payment.js";
