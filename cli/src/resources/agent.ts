import type { HttpClient } from "../core/http.js";
import type {
  ActivateResult,
  HederaNetwork,
  MeResult,
  RevokeResult,
  WalletRegisterResult,
} from "../types/agent.js";

export interface RegisterWalletInput {
  evmAddress: string;
  publicKey: string;
  network: HederaNetwork;
}

export interface ActivateInput {
  transactionId: string;
}

export class AgentResource {
  constructor(private readonly getHttp: () => Promise<HttpClient>) {}

  /** GET /v1/agent/me — the SDK's identity/whoami/poll endpoint. */
  async me(): Promise<MeResult> {
    const http = await this.getHttp();
    return http.request<MeResult>("GET", "/v1/agent/me");
  }

  /** POST /v1/agent/wallet — registers the locally generated EVM address. Never send a private key. */
  async registerWallet(input: RegisterWalletInput): Promise<WalletRegisterResult> {
    const http = await this.getHttp();
    return http.request<WalletRegisterResult>("POST", "/v1/agent/wallet", { body: input });
  }

  /** POST /v1/agent/activate — confirms the hollow-account activation transaction. Idempotent. */
  async activate(input: ActivateInput): Promise<ActivateResult> {
    const http = await this.getHttp();
    return http.request<ActivateResult>("POST", "/v1/agent/activate", { body: input });
  }

  /** POST /v1/agent/revoke — idempotent. */
  async revoke(): Promise<RevokeResult> {
    const http = await this.getHttp();
    return http.request<RevokeResult>("POST", "/v1/agent/revoke", { body: {} });
  }
}
