import crypto from 'crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/backend/authConfig';
import { PrincipalError } from '@/app/lib/backend/errors';
import connectDB from '@/app/lib/mongodb';
import { Agent } from '@/app/models/Agent';
import type { Scope } from '@/app/models/Agent';
import User from '@/app/models/User';

interface PrincipalBase {
  userId: string;
  rootFolder: string;
  email: string;
  name: string | null;
}

export type Principal =
  | ({ kind: 'user'; user: any } & PrincipalBase)
  | ({ kind: 'agent'; agentId: string; scopes: Scope[]; agent: any } & PrincipalBase);

// Agent-lane routes an agent must be able to call before it is `active` -
// onboarding itself requires calling them. Everything else is locked to
// active agents only (see resolveAgent step 4).
const ONBOARDING_PATHS = new Set([
  '/api/v1/agent/wallet',
  '/api/v1/agent/me',
  '/api/v1/agent/activate',
  '/api/v1/agent/revoke',
]);

// Even a revoked agent must be able to call /revoke again (idempotency) -
// exempt that one path from the blanket "revoked -> 401" check below.
const REVOKE_EXEMPT_PATHS = new Set(['/api/v1/agent/revoke']);

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function resolveUser(session: any): Promise<Principal> {
  return {
    kind: 'user',
    userId: session.user.id,
    rootFolder: session.user.rootFolder ?? null,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    user: session.user,
  };
}

async function resolveAgent(token: string, pathname: string): Promise<Principal> {
  await connectDB();

  if (token.length < 12) {
    throw new PrincipalError(401, 'unauthenticated', 'Unauthorized');
  }

  const keyPrefix = token.slice(0, 12);
  const agent = await Agent.findOne({ keyPrefix });

  if (!agent || !agent.keyHash) {
    throw new PrincipalError(401, 'unauthenticated', 'Unauthorized');
  }

  const candidate = Buffer.from(sha256Hex(token), 'hex');
  const stored = Buffer.from(agent.keyHash, 'hex');
  const matches =
    candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);

  if (!matches) {
    throw new PrincipalError(401, 'unauthenticated', 'Unauthorized');
  }

  if (agent.status === 'revoked' && !REVOKE_EXEMPT_PATHS.has(pathname)) {
    throw new PrincipalError(401, 'key_revoked', 'This API key has been revoked');
  }

  if (agent.status !== 'active' && !ONBOARDING_PATHS.has(pathname)) {
    throw new PrincipalError(403, 'agent_not_active', 'Agent has not completed onboarding yet');
  }

  // Fire-and-forget: never make the auth hot path wait on a write.
  Agent.updateOne({ _id: agent._id }, { $set: { lastSeenAt: new Date() } }).catch((err) => {
    console.error('Failed to update agent lastSeenAt:', err);
  });

  const owner = await User.findById(agent.owner);
  if (!owner) {
    throw new PrincipalError(401, 'unauthenticated', 'Unauthorized');
  }

  return {
    kind: 'agent',
    userId: agent.owner.toString(),
    agentId: agent._id.toString(),
    scopes: agent.scopes,
    rootFolder: owner.rootFolder ? owner.rootFolder.toString() : null,
    email: owner.email,
    name: owner.name ?? null,
    agent,
  } as Principal;
}

/**
 * Resolves the caller's principal from either lane: `Authorization: Bearer`
 * (agent) is checked first since it's a single indexed lookup and
 * unambiguous; falls back to the NextAuth session cookie (human). Returns
 * null when neither credential is present. Throws PrincipalError for
 * credential-specific failures (revoked key, inactive agent) that need a
 * status/code more specific than a bare 401.
 */
export async function resolvePrincipal(request: Request): Promise<Principal | null> {
  const auth = request.headers.get('authorization');

  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    const pathname = new URL(request.url).pathname;
    return resolveAgent(token, pathname);
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return resolveUser(session);
  }

  return null;
}

/**
 * Same as resolvePrincipal, but throws a 401 PrincipalError when there is no
 * principal at all, and a 403 when an agent principal lacks the required
 * scope. A user principal always passes the scope check - scopes constrain
 * agents, not their owners.
 */
export async function requirePrincipal(request: Request, scope?: Scope): Promise<Principal> {
  const principal = await resolvePrincipal(request);

  if (!principal) {
    throw new PrincipalError(401, 'unauthenticated', 'Unauthorized');
  }

  if (scope && principal.kind === 'agent' && !principal.scopes.includes(scope)) {
    throw new PrincipalError(403, 'insufficient_scope', `Missing scope: ${scope}`, {
      requiredScope: scope,
    });
  }

  return principal;
}

/**
 * For the agent-only endpoints under /api/v1/agent/* - these are SDK
 * territory and are never meant to accept a human session cookie.
 */
export async function requireAgentPrincipal(
  request: Request
): Promise<Extract<Principal, { kind: 'agent' }>> {
  const principal = await requirePrincipal(request);
  if (principal.kind !== 'agent') {
    throw new PrincipalError(401, 'unauthenticated', 'Bearer token required');
  }
  return principal;
}
