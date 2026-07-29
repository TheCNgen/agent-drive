export type OnboardingState =
  | 'waiting' | 'claimed' | 'wallet' | 'funded' | 'active' | 'expired' | 'revoked';

export type AgentStatus = 'pending' | 'active' | 'revoked';

export interface AgentStats {
  totalSpentTinybars: string;
  purchasesSucceeded: number;
  purchasesFailed: number;
  successRate: number | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
  onboardingState: OnboardingState;
  scopes: string[];
  network: string;
  evmAddress: string | null;
  accountId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  stats: AgentStats;
}

export interface AgentWallet {
  evmAddress: string | null;
  accountId: string | null;
  network: string;
  balanceTinybars: string;
  usdcBalance: string | null;
  funded: boolean;
  activated: boolean;
  suggestedFundingTinybars: string;
}

export interface AgentDetail {
  agent: AgentSummary;
  wallet: AgentWallet;
  claim: { state: string; expiresAt: string; claimedByIp: string | null; claimedByClient: string | null } | null;
}

/** The payload of an SSE `event: state` frame. */
export interface AgentStateEvent {
  onboardingState: OnboardingState;
  status: AgentStatus;
  evmAddress: string | null;
  accountId: string | null;
  balanceTinybars: string;
  suggestedFundingTinybars: string;
  lastSeenAt: string | null;
}

export interface DashboardSummary {
  agents: { total: number; active: number; pending: number; revoked: number };
  spend: { totalTinybars: string; purchaseCount: number };
  files: { count: number; totalBytes: number };
}
