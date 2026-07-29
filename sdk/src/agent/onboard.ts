import { CashDrive } from "../client.js";
import { DEFAULT_API_PREFIX, DEFAULT_BASE_URL } from "../config.js";
import { redeemClaim } from "../auth/claim.js";
import { ACTIVATION_RETRY_MESSAGE, activateAccount } from "./activate.js";
import { generateWallet, loadWallet } from "./wallet.js";
import { patchProfile, readProfile, writeProfile } from "./configStore.js";
import { ActivationError, CashDriveError, isCashDriveError } from "../errors.js";
import { sleep } from "../core/retry.js";
import type { AgentProfile, ClaimResult, HederaNetwork, OnboardState } from "../types/agent.js";

const DEFAULT_PROFILE_NAME = "default";
const DEFAULT_FUNDING_TIMEOUT_MS = 900_000; // 15 minutes
const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TESTNET: HederaNetwork = "hedera-testnet";

export interface OnboardOptions {
  claimCode?: string | undefined;
  resume?: boolean | undefined;
  baseUrl?: string | undefined;
  profile?: string | undefined;
  waitForFunding?: boolean | undefined;
  fundingTimeoutMs?: number | undefined;
  onState?: ((state: OnboardState) => void) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
}

function buildClient(profile: AgentProfile, fetchImpl?: typeof globalThis.fetch): CashDrive {
  return new CashDrive({
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    apiPrefix: profile.apiPrefix,
    fetch: fetchImpl,
  });
}

async function pollUntilFunded(
  client: CashDrive,
  opts: { evmAddress: string; fundingTimeoutMs: number; emit: (s: OnboardState) => void },
): Promise<{ accountId: string; balanceTinybars: string } | "timeout"> {
  const start = Date.now();
  for (;;) {
    const me = await client.agent.me();
    if (me.wallet.funded && me.wallet.accountId) {
      return { accountId: me.wallet.accountId, balanceTinybars: me.wallet.balanceTinybars };
    }

    const elapsedMs = Date.now() - start;
    opts.emit({
      state: "awaiting_funding",
      evmAddress: opts.evmAddress,
      balanceTinybars: me.wallet.balanceTinybars,
      elapsedMs,
    });

    if (elapsedMs >= opts.fundingTimeoutMs) return "timeout";
    await sleep(Math.min(POLL_INTERVAL_MS, opts.fundingTimeoutMs - elapsedMs));
  }
}

/** Translates the backend's not_funded/not_activated codes into the operator-facing ActivationError. */
async function confirmActivation(client: CashDrive, accountId: string, transactionId: string) {
  try {
    return await client.agent.activate({ transactionId });
  } catch (err) {
    if (isCashDriveError(err) && (err.code === "not_activated" || err.code === "not_funded")) {
      throw new ActivationError(ACTIVATION_RETRY_MESSAGE, {
        status: err.status,
        method: err.method,
        path: err.path,
        cause: err,
        body: { accountId, transactionId, code: err.code },
      });
    }
    throw err;
  }
}

/**
 * Takes an agent from a claim code to an activated, funded, wallet-bearing identity
 * persisted at ~/.cash-drive/config.json. The step order is load-bearing: each piece of
 * state is written to disk before the next step touches it, so a process crash at any
 * point leaves behind a profile `--resume` can pick back up rather than an orphaned key
 * or a spent claim code with nothing to show for it.
 */
export async function onboard(options: OnboardOptions): Promise<AgentProfile> {
  const profileName = options.profile ?? DEFAULT_PROFILE_NAME;
  const emit = options.onState ?? (() => {});
  const waitForFunding = options.waitForFunding ?? true;
  const fundingTimeoutMs = options.fundingTimeoutMs ?? DEFAULT_FUNDING_TIMEOUT_MS;

  let profile: AgentProfile;
  let claimResult: ClaimResult | undefined;

  if (options.resume) {
    const existing = await readProfile(profileName);
    if (!existing) {
      throw new CashDriveError(
        `No profile named "${profileName}" to resume. Run \`cash-drive onboard --claim <code>\` first.`,
        "profile_not_found",
      );
    }
    profile = existing;
  } else {
    if (!options.claimCode) {
      throw new CashDriveError("A claim code is required unless --resume is set.", "bad_request");
    }

    emit({ state: "claiming" });
    claimResult = await redeemClaim({
      code: options.claimCode,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiPrefix: DEFAULT_API_PREFIX,
      fetch: options.fetch,
    });

    // The claim code is now spent. Persist before generating a wallet -- if anything
    // below fails, the operator still has the key and can --resume.
    profile = {
      apiKey: claimResult.apiKey,
      baseUrl: claimResult.api.baseUrl,
      apiPrefix: claimResult.api.apiPrefix,
      agent: {
        id: claimResult.agent.id,
        name: claimResult.agent.name,
        onboardingState: claimResult.agent.onboardingState,
      },
      createdAt: claimResult.agent.createdAt,
    };
    await writeProfile(profileName, profile);
    emit({ state: "claimed", agent: claimResult.agent });
  }

  const client = buildClient(profile, options.fetch);

  // Step 3: generate the wallet. Persist it before doing anything else with the keys --
  // if the process dies right after this and the backend has already recorded the
  // address, the agent must not end up owning an account it cannot sign for.
  if (!profile.wallet) {
    const generated = generateWallet();
    const network = claimResult?.wallet.network ?? DEFAULT_TESTNET;
    profile = {
      ...profile,
      wallet: {
        network,
        evmAddress: generated.evmAddress,
        accountId: null,
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        activated: false,
      },
    };
    await writeProfile(profileName, profile);
    emit({ state: "wallet_generated", evmAddress: generated.evmAddress });
  }

  const wallet = profile.wallet;
  if (!wallet) {
    throw new CashDriveError("Wallet generation did not persist as expected.", "internal_error");
  }

  // Step 4: register with the backend. Idempotent -- re-registering the same address is a
  // 200, so this is safe to repeat on --resume without knowing whether it already ran.
  if (!wallet.activated && wallet.accountId === null) {
    const result = await client.agent.registerWallet({
      evmAddress: wallet.evmAddress,
      publicKey: wallet.publicKey,
      network: wallet.network,
    });
    profile = { ...profile, agent: { ...profile.agent, onboardingState: result.agent.onboardingState } };
    await patchProfile(profileName, { agent: profile.agent });
    emit({
      state: "wallet_registered",
      evmAddress: wallet.evmAddress,
      suggestedFundingTinybars: result.wallet.suggestedFundingTinybars ?? "500000000",
    });

    if (!waitForFunding) {
      return profile;
    }
  }

  // Step 5: wait for the operator to fund the alias. Not a failure on timeout -- the
  // operator being slow is not an error condition.
  if (wallet.accountId === null) {
    const funded = await pollUntilFunded(client, {
      evmAddress: wallet.evmAddress,
      fundingTimeoutMs,
      emit,
    });

    if (funded === "timeout") {
      return profile;
    }

    profile = { ...profile, wallet: { ...wallet, accountId: funded.accountId } };
    await patchProfile(profileName, { wallet: profile.wallet });
    emit({ state: "funded", accountId: funded.accountId, balanceTinybars: funded.balanceTinybars });
  }

  const fundedWallet = profile.wallet;
  if (!fundedWallet || !fundedWallet.accountId) {
    throw new CashDriveError("Funding did not persist as expected.", "internal_error");
  }

  // Step 6: self-pay the hollow-account activation transaction, then confirm it with the backend.
  if (!fundedWallet.activated) {
    emit({ state: "activating", accountId: fundedWallet.accountId });
    const loaded = loadWallet(profile);
    const { transactionId } = await activateAccount({
      accountId: fundedWallet.accountId,
      privateKey: loaded.privateKey,
      network: fundedWallet.network,
    });
    await confirmActivation(client, fundedWallet.accountId, transactionId);

    profile = {
      ...profile,
      agent: { ...profile.agent, onboardingState: "active" },
      wallet: { ...fundedWallet, activated: true },
    };
    await patchProfile(profileName, { agent: profile.agent, wallet: profile.wallet });
  }

  // Step 7: fetch the canonical final state and persist it.
  const me = await client.agent.me();
  const currentWallet = profile.wallet ?? fundedWallet;
  profile = {
    ...profile,
    agent: { ...profile.agent, onboardingState: me.agent.onboardingState },
    wallet: { ...currentWallet, accountId: me.wallet.accountId, activated: me.wallet.activated ?? true },
  };
  await patchProfile(profileName, { agent: profile.agent, wallet: profile.wallet });
  emit({ state: "active", agent: me.agent, wallet: me.wallet });

  return (await readProfile(profileName)) ?? profile;
}
