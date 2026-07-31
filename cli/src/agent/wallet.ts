import { PrivateKey } from "@hiero-ledger/sdk";
import { AgentDriveError } from "../errors.js";
import type { AgentProfile } from "../types/agent.js";

export interface GeneratedWallet {
  privateKey: string;
  publicKey: string;
  evmAddress: string;
}

const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

/** Lowercase, 0x-prefixed, one representation held consistently -- never EIP-55 checksum casing. */
function normalizeEvmAddress(raw: string): string {
  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  return `0x${hex.toLowerCase()}`;
}

/**
 * Generates a non-custodial ECDSA secp256k1 keypair. Must be ECDSA: Ed25519 keys
 * (PrivateKey.generate()/generateED25519()) have no EVM address, so an alias built from
 * one can never be funded.
 */
export function generateWallet(): GeneratedWallet {
  const key = PrivateKey.generateECDSA();
  return {
    privateKey: key.toStringDer(),
    publicKey: key.publicKey.toStringDer(),
    evmAddress: normalizeEvmAddress(key.publicKey.toEvmAddress()),
  };
}

export function loadWallet(profile: AgentProfile): GeneratedWallet {
  if (!profile.wallet) {
    throw new AgentDriveError("This profile has no wallet yet.", "wallet_missing");
  }
  const key = PrivateKey.fromStringECDSA(profile.wallet.privateKey);
  return {
    privateKey: key.toStringDer(),
    publicKey: key.publicKey.toStringDer(),
    evmAddress: normalizeEvmAddress(key.publicKey.toEvmAddress()),
  };
}

export function isValidEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}
