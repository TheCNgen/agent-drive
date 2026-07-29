export interface CashDriveErrorOptions {
  status?: number | undefined;
  method?: string | undefined;
  path?: string | undefined;
  body?: unknown;
  cause?: unknown;
}

export class CashDriveError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly method?: string;
  readonly path?: string;
  readonly body?: unknown;

  constructor(message: string, code: string, options: CashDriveErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.method !== undefined) this.method = options.method;
    if (options.path !== undefined) this.path = options.path;
    if (options.body !== undefined) this.body = options.body;
  }
}

export class ValidationError extends CashDriveError {
  constructor(message: string, options: CashDriveErrorOptions = {}) {
    super(message, "bad_request", options);
  }
}

export class ClaimInvalidError extends CashDriveError {
  constructor(options: CashDriveErrorOptions = {}) {
    super(
      "This claim code is invalid, already used, or expired. Claim codes last 10 minutes and can be used once. Generate a new one from your CashDrive dashboard.",
      "claim_invalid",
      options,
    );
  }
}

export class AuthenticationError extends CashDriveError {
  constructor(message = "Authentication failed.", options: CashDriveErrorOptions = {}) {
    super(message, "unauthenticated", options);
  }
}

export class KeyRevokedError extends CashDriveError {
  constructor(options: CashDriveErrorOptions = {}) {
    super(
      "This agent's API key has been revoked. Run `cash-drive onboard --claim <new-code>` with a fresh code from your dashboard. Your existing wallet remains in ~/.cash-drive/config.json.",
      "key_revoked",
      options,
    );
  }
}

export class MissingCredentialsError extends CashDriveError {
  constructor(options: CashDriveErrorOptions = {}) {
    super(
      "No CashDrive credentials found. Run `cash-drive onboard --claim <code>` with a claim code from your dashboard, or set CASHDRIVE_API_KEY.",
      "missing_credentials",
      options,
    );
  }
}

export class InsufficientScopeError extends CashDriveError {
  readonly requiredScope?: string;
  constructor(requiredScope?: string, options: CashDriveErrorOptions = {}) {
    super(
      requiredScope
        ? `This agent lacks the \`${requiredScope}\` scope.`
        : "This agent lacks the required scope for this action.",
      "insufficient_scope",
      options,
    );
    if (requiredScope !== undefined) this.requiredScope = requiredScope;
  }
}

export class AgentNotActiveError extends CashDriveError {
  constructor(message = "This agent has not completed onboarding yet.", options: CashDriveErrorOptions = {}) {
    super(message, "agent_not_active", options);
  }
}

export class ActivationError extends CashDriveError {
  constructor(message: string, options: CashDriveErrorOptions = {}) {
    super(message, "activation_failed", options);
  }
}

export class NotFoundError extends CashDriveError {
  constructor(message = "Not found.", options: CashDriveErrorOptions = {}) {
    super(message, "not_found", options);
  }
}

export class ConflictError extends CashDriveError {
  constructor(message = "Conflict.", options: CashDriveErrorOptions = {}) {
    super(message, "conflict", options);
  }
}

export class GoneError extends CashDriveError {
  constructor(message = "This resource is gone.", options: CashDriveErrorOptions = {}) {
    super(message, "gone", options);
  }
}

export class PaymentRequiredError extends CashDriveError {
  constructor(message = "Payment is required to access this resource.", options: CashDriveErrorOptions = {}) {
    super(message, "payment_required", options);
  }
}

export class ServerError extends CashDriveError {
  constructor(message = "The server encountered an error.", options: CashDriveErrorOptions = {}) {
    super(message, "server_error", options);
  }
}

export class NetworkError extends CashDriveError {
  constructor(message = "A network error occurred.", options: CashDriveErrorOptions = {}) {
    super(message, "network_error", options);
  }
}

export class TimeoutError extends CashDriveError {
  constructor(message = "The request timed out.", options: CashDriveErrorOptions = {}) {
    super(message, "timeout", options);
  }
}

export class AgentNotActivatedError extends CashDriveError {
  constructor(options: CashDriveErrorOptions = {}) {
    super(
      "This agent's Hedera account is not activated. Run `cash-drive onboard --resume`.",
      "agent_not_activated",
      options,
    );
  }
}

export class InsufficientBalanceError extends CashDriveError {
  readonly requiredTinybars: string;
  readonly availableTinybars: string;
  constructor(requiredTinybars: string, availableTinybars: string, options: CashDriveErrorOptions = {}) {
    super(
      `This purchase needs ${requiredTinybars} tinybars but the agent's wallet only holds ${availableTinybars}. Fund the agent's Hedera account and try again.`,
      "insufficient_balance",
      options,
    );
    this.requiredTinybars = requiredTinybars;
    this.availableTinybars = availableTinybars;
  }
}

export class PriceChangedError extends CashDriveError {
  readonly oldPriceTinybars: string;
  readonly newPriceTinybars: string;
  constructor(oldPriceTinybars: string, newPriceTinybars: string, options: CashDriveErrorOptions = {}) {
    super(
      `The quote expired and the re-quoted price (${newPriceTinybars} tinybars) differs from the original (${oldPriceTinybars} tinybars). Refusing to pay a different amount than shown; call quote() again to confirm.`,
      "price_changed",
      options,
    );
    this.oldPriceTinybars = oldPriceTinybars;
    this.newPriceTinybars = newPriceTinybars;
  }
}

export class FacilitatorUnavailableError extends CashDriveError {
  constructor(message = "The x402 payment facilitator is unreachable. This is transient - nothing was signed or submitted, and the purchase is safe to retry.", options: CashDriveErrorOptions = {}) {
    super(message, "facilitator_unavailable", options);
  }
}

export class PaymentVerificationError extends CashDriveError {
  constructor(message = "The facilitator rejected the payment payload.", options: CashDriveErrorOptions = {}) {
    super(message, "payment_verification_failed", options);
  }
}

export class SettlementFailedError extends CashDriveError {
  constructor(
    message = "Settlement failed; whether the transaction reached the network is unknown. Run `cash-drive payments recover`.",
    options: CashDriveErrorOptions = {},
  ) {
    super(message, "settlement_failed", options);
  }
}

export class ConfigCorruptError extends CashDriveError {
  constructor(path: string, options: CashDriveErrorOptions = {}) {
    super(
      `The CashDrive config file at ${path} could not be parsed. It has not been deleted; if you no longer need it, remove it manually.`,
      "config_corrupt",
      options,
    );
  }
}

export function isCashDriveError(e: unknown): e is CashDriveError {
  return e instanceof CashDriveError;
}

/**
 * Builds the right typed error for an API response. Branches on `code` first (per the
 * backend contract), falling back to `status` only when `code` is unrecognized.
 */
export function errorFromApiResponse(
  status: number,
  body: { error?: string; code?: string; [key: string]: unknown } | undefined,
  options: { method: string; path: string },
): CashDriveError {
  const code = body?.code;
  const message = typeof body?.error === "string" ? body.error : undefined;
  const base: CashDriveErrorOptions = { status, method: options.method, path: options.path, body };

  switch (code) {
    case "bad_request":
      return new ValidationError(message ?? "The request was invalid.", base);
    case "claim_invalid":
      return new ClaimInvalidError(base);
    case "unauthenticated":
      return new AuthenticationError(message, base);
    case "key_revoked":
      return new KeyRevokedError(base);
    case "missing_credentials":
      return new MissingCredentialsError(base);
    case "insufficient_scope":
      return new InsufficientScopeError(
        typeof body?.requiredScope === "string" ? body.requiredScope : undefined,
        base,
      );
    case "agent_not_active":
      return new AgentNotActiveError(message, base);
    case "activation_failed":
      return new ActivationError(message ?? "Activation failed.", base);
    case "not_found":
      return new NotFoundError(message, base);
    case "conflict":
      return new ConflictError(message, base);
    case "gone":
      return new GoneError(message, base);
    case "payment_required":
      return new PaymentRequiredError(message, base);
    case "server_error":
      return new ServerError(message, base);
    case "facilitator_unavailable":
      return new FacilitatorUnavailableError(message, base);
    case "payment_verification_failed":
      return new PaymentVerificationError(message, base);
    case "settlement_failed":
      return new SettlementFailedError(message, base);
    default:
      break;
  }

  if (typeof code === "string" && code.length > 0) {
    return new CashDriveError(message ?? `Request failed with code "${code}".`, code, base);
  }

  if (status === 401) return new AuthenticationError(message, base);
  if (status === 403) return new InsufficientScopeError(undefined, base);
  if (status === 404) return new NotFoundError(message, base);
  if (status === 409) return new ConflictError(message, base);
  if (status === 410) return new GoneError(message, base);
  if (status === 402) return new PaymentRequiredError(message, base);
  if (status === 400) return new ValidationError(message ?? "The request was invalid.", base);
  if (status >= 500) return new ServerError(message, base);
  return new CashDriveError(message ?? `Request failed with status ${status}.`, "unknown_error", base);
}
