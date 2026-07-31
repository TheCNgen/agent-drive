/**
 * Recursively checks whether a request body carries a `privateKey` field at
 * any depth (case-insensitive key match). AgentDrive is non-custodial for
 * agent wallets: a private key must never be able to reach the server, even
 * by accident (a confused SDK integration, a copy-pasted debug payload).
 */
export function containsPrivateKeyField(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some(containsPrivateKeyField);
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'privatekey') return true;
    if (containsPrivateKeyField(nested)) return true;
  }

  return false;
}
