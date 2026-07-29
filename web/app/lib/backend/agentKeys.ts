import crypto from 'crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const API_KEY_PREFIX = 'cdk_test_';
const API_KEY_RANDOM_LENGTH = 43;

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** cdk_test_ + 43 base62 chars, ~256 bits of entropy. Matches /^cdk_test_[0-9A-Za-z]{43}$/. */
export function generateApiKey(): string {
  const bytes = crypto.randomBytes(API_KEY_RANDOM_LENGTH);
  let random = '';
  for (let i = 0; i < API_KEY_RANDOM_LENGTH; i++) {
    random += BASE62[bytes[i] % BASE62.length];
  }
  return `${API_KEY_PREFIX}${random}`;
}

export function apiKeyPrefix(apiKey: string): string {
  return apiKey.slice(0, 12);
}

/** 16 random bytes -> 32 lowercase hex chars. Single-use, expires in 10 minutes. */
export function generateClaimCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

export const CLAIM_CODE_TTL_MS = 10 * 60 * 1000;
export const SUGGESTED_FUNDING_TINYBARS = '500000000';
