export type OnboardingState =
  | "waiting"
  | "claimed"
  | "wallet"
  | "funded"
  | "active"
  | "revoked";

export type AgentStatus = "pending" | "active" | "revoked";

export type HederaNetwork = "hedera-testnet" | "hedera-mainnet";

export interface AgentIdentity {
  id: string;
  name: string;
  status: AgentStatus;
  onboardingState: OnboardingState;
  scopes: string[];
  createdAt: string;
  lastSeenAt?: string;
}

export interface ApiConnectionInfo {
  baseUrl: string;
  apiPrefix: string;
}

export interface WalletRequirement {
  required: boolean;
  network: HederaNetwork;
  suggestedFundingTinybars: string;
}

export interface OwnerInfo {
  id: string;
  email: string;
  name?: string;
}

export interface ClaimResult {
  apiKey: string;
  agent: AgentIdentity;
  api: ApiConnectionInfo;
  wallet: WalletRequirement;
  owner: OwnerInfo;
}

export interface WalletInfo {
  evmAddress: string;
  accountId: string | null;
  network: HederaNetwork;
  balanceTinybars: string;
  funded: boolean;
  activated?: boolean | undefined;
  suggestedFundingTinybars?: string | undefined;
}

export interface WalletRegisterResult {
  agent: Pick<AgentIdentity, "id" | "status" | "onboardingState">;
  wallet: WalletInfo;
}

export interface MeResult {
  agent: AgentIdentity;
  wallet: WalletInfo;
  owner: OwnerInfo;
}

export interface ActivateResult {
  agent: Pick<AgentIdentity, "status" | "onboardingState">;
  wallet: Pick<WalletInfo, "activated">;
}

export interface RevokeResult {
  revoked: boolean;
}

export interface WalletProfileFields {
  network: HederaNetwork;
  evmAddress: string;
  accountId: string | null;
  publicKey: string;
  privateKey: string;
  activated: boolean;
}

/** Stored on disk at ~/.agent-drive/config.json, one entry per profile. */
export interface AgentProfile {
  apiKey: string;
  baseUrl: string;
  apiPrefix: string;
  agent: {
    id: string;
    name: string;
    onboardingState: OnboardingState;
  };
  wallet?: WalletProfileFields | undefined;
  revoked?: boolean | undefined;
  createdAt: string;
}

export interface StoredConfig {
  version: 1;
  currentProfile: string;
  profiles: Record<string, AgentProfile>;
}

export type OnboardState =
  | { state: "claiming" }
  | { state: "claimed"; agent: AgentIdentity }
  | { state: "wallet_generated"; evmAddress: string }
  | {
      state: "wallet_registered";
      evmAddress: string;
      suggestedFundingTinybars: string;
    }
  | {
      state: "awaiting_funding";
      evmAddress: string;
      balanceTinybars: string;
      elapsedMs: number;
    }
  | { state: "funded"; accountId: string; balanceTinybars: string }
  | { state: "activating"; accountId: string }
  | { state: "active"; agent: AgentIdentity; wallet: WalletInfo };
