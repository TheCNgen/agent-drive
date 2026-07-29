import { config } from '@/app/lib/config';

export interface MirrorAccount {
  accountId: string;
  balanceTinybars: string;
  key: unknown | null;
}

interface CacheEntry {
  data: MirrorAccount | null;
  fetchedAt: number;
}

// Module-level cache: Next.js keeps this warm across requests on the same
// server instance. It's a plain Map rather than a background timer - see
// agentFunding's design note in the stage doc: no interval lives in the
// Next process, callers just get a cheap, occasionally-stale read.
const mirrorCache = new Map<string, CacheEntry>();

const FETCH_TIMEOUT_MS = 5000;

function mirrorBaseUrl(): string {
  const base = config.hedera.mirrorNodeUrl || 'https://testnet.mirrornode.hedera.com';
  return base.replace(/\/$/, '');
}

/**
 * Fresh (uncached) lookup of an account by id or EVM address alias. Returns
 * null on a 404 (no account at that alias/id yet - the expected steady
 * state before funding). Throws on timeout or non-404 error so the caller
 * can decide whether to fall back to a cached value.
 */
export async function fetchMirrorAccount(idOrAlias: string): Promise<MirrorAccount | null> {
  const url = `${mirrorBaseUrl()}/api/v1/accounts/${idOrAlias}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Mirror node responded ${res.status} for ${idOrAlias}`);
    }

    const json: any = await res.json();
    return {
      accountId: json.account,
      balanceTinybars: String(json.balance?.balance ?? '0'),
      key: json.key ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cached lookup. A mirror-node failure never propagates - it logs and falls
 * back to the last-known value (or null if there's never been one), so a
 * flaky third-party mirror node never fails the request it's backing.
 */
async function getMirrorAccountCached(idOrAlias: string, ttlMs: number): Promise<MirrorAccount | null> {
  const cached = mirrorCache.get(idOrAlias);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < ttlMs) {
    return cached.data;
  }

  try {
    const account = await fetchMirrorAccount(idOrAlias);
    mirrorCache.set(idOrAlias, { data: account, fetchedAt: now });
    return account;
  } catch (error) {
    console.error(`Mirror node lookup failed for ${idOrAlias}, using last-known state:`, error);
    return cached ? cached.data : null;
  }
}

/**
 * balanceTinybars for /me and the SSE stream - 10s cache keyed by
 * accountId, per the stage spec (an uncached mirror call per SDK poll would
 * needlessly hammer the public mirror node).
 */
export async function getCachedBalanceTinybars(accountId: string): Promise<string> {
  const account = await getMirrorAccountCached(accountId, 10_000);
  return account?.balanceTinybars ?? '0';
}

/**
 * Lazily advances an agent's onboarding state by checking the mirror node,
 * driven by whoever calls it (GET /me, the SSE tick) rather than a
 * background job. Only handles wallet -> funded; funded -> active requires
 * the agent's own self-paid activation transaction (POST /activate) and is
 * never inferred here.
 */
export async function refreshAgentWalletState(agent: any): Promise<any> {
  if (!agent.evmAddress || ['active', 'revoked'].includes(agent.onboardingState)) {
    return agent;
  }

  const identifier = agent.accountId || agent.evmAddress;
  const account = await getMirrorAccountCached(identifier, 5_000);

  if (!account) {
    return agent; // no account at the alias yet - still 'wallet'
  }

  if (agent.onboardingState === 'wallet') {
    agent.accountId = account.accountId;
    agent.onboardingState = 'funded';
    agent.fundedAt = new Date();
    await agent.save();
  }

  return agent;
}
