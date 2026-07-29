import { PrivateKey } from "@hiero-ledger/sdk";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { PaymentRequirements } from "@x402/core/types";
import { AgentNotActivatedError, CashDriveError } from "../errors.js";
import type { PaymentSigner, XPaymentPayload, XPaymentRequirements } from "../types/payment.js";
import { readProfile } from "./configStore.js";
import { loadWallet } from "./wallet.js";

const NETWORK = "hedera:testnet";

/**
 * Signs x402 payment payloads with the active profile's own ECDSA key. Per the stage doc
 * §4.2: the private key is read from disk fresh on every {@link signPaymentPayload} call and
 * never retained as an instance field between calls, so a heap dump of a long-lived signer
 * object never yields the key - only a live call does, briefly.
 */
export class LocalKeySigner implements PaymentSigner {
  readonly accountId: string;
  readonly evmAddress: string;
  private readonly profileName: string | undefined;

  private constructor(accountId: string, evmAddress: string, profileName: string | undefined) {
    this.accountId = accountId;
    this.evmAddress = evmAddress;
    this.profileName = profileName;
  }

  /**
   * Builds a signer for the given (or current) profile. Throws {@link AgentNotActivatedError}
   * if the profile isn't fully onboarded yet - the same guard `payments.quote()`/`purchase()`
   * run before ever contacting the facilitator (stage doc §1.4/§5.1).
   */
  static async fromProfile(profileName?: string): Promise<LocalKeySigner> {
    const profile = await readProfile(profileName);
    if (!profile || profile.agent.onboardingState !== "active" || !profile.wallet?.accountId || !profile.wallet.activated) {
      throw new AgentNotActivatedError();
    }
    const wallet = loadWallet(profile);
    return new LocalKeySigner(profile.wallet.accountId, wallet.evmAddress, profileName);
  }

  async signPaymentPayload(requirements: XPaymentRequirements): Promise<XPaymentPayload> {
    const profile = await readProfile(this.profileName);
    if (!profile?.wallet) {
      throw new CashDriveError("This profile has no wallet yet.", "wallet_missing");
    }

    // Scoped to this call only - never assigned to `this`, eligible for GC as soon as
    // signPaymentPayload returns.
    const key = PrivateKey.fromStringECDSA(profile.wallet.privateKey);
    const hederaSigner = createClientHederaSigner(this.accountId, key, { network: NETWORK });
    const scheme = new ExactHederaScheme(hederaSigner);
    const result = await scheme.createPaymentPayload(2, requirements as unknown as PaymentRequirements);

    return {
      x402Version: result.x402Version,
      accepted: requirements,
      payload: result.payload,
      ...(result.extensions ? { extensions: result.extensions } : {}),
    };
  }
}
