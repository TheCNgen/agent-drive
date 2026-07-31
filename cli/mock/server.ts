/**
 * A minimal, dependency-free stand-in for the AgentDrive backend's agent lane, so the SDK
 * and CLI can be exercised locally without the full Next.js app or MongoDB. It genuinely
 * polls the public Hedera testnet mirror node for funding/activation state, so a real
 * `hcli account transfer` against the printed address is enough to drive a full
 * onboarding run end to end.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const MIRROR_NODE_URL = process.env.MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";
const SUGGESTED_FUNDING_TINYBARS = "500000000";
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += BASE62[(bytes[i] ?? 0) % BASE62.length];
  return out;
}

interface Claim {
  agentId: string;
  claimedAt: string | null;
  expiresAt: number;
}

interface Wallet {
  evmAddress: string;
  publicKey: string;
  network: string;
  accountId: string | null;
  balanceTinybars: string;
  funded: boolean;
  activated: boolean;
}

interface Agent {
  id: string;
  name: string;
  status: "pending" | "active" | "revoked";
  onboardingState: "waiting" | "claimed" | "wallet" | "funded" | "active" | "revoked";
  scopes: string[];
  createdAt: string;
  apiKey: string;
  wallet?: Wallet;
}

const claims = new Map<string, Claim>();
const agentsById = new Map<string, Agent>();

function mintClaim(): { code: string; agentId: string } {
  const code = randomBytes(16).toString("hex");
  const agentId = randomBytes(12).toString("hex");
  const agent: Agent = {
    id: agentId,
    name: `agent-${agentId.slice(0, 6)}`,
    status: "pending",
    onboardingState: "waiting",
    scopes: ["items:read", "items:write", "listings:read", "listings:write", "ai:invoke"],
    createdAt: new Date().toISOString(),
    apiKey: "",
  };
  agentsById.set(agentId, agent);
  claims.set(code, { agentId, claimedAt: null, expiresAt: Date.now() + 10 * 60 * 1000 });
  return { code, agentId };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function containsPrivateKeyField(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (/private.?key/i.test(key)) return true;
    if (containsPrivateKeyField(v)) return true;
  }
  return false;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

interface MirrorAccount {
  account?: string;
  key?: unknown;
  balance?: { balance?: number };
}

async function fetchMirrorAccount(idOrAlias: string): Promise<MirrorAccount | null> {
  try {
    const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${idOrAlias}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as MirrorAccount;
  } catch {
    return null;
  }
}

function authenticate(req: IncomingMessage): Agent | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const key = header.slice("Bearer ".length);
  for (const agent of agentsById.values()) {
    if (agent.apiKey && agent.apiKey === key) return agent;
  }
  return null;
}

function agentIdentity(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    onboardingState: agent.onboardingState,
    scopes: agent.scopes,
    createdAt: agent.createdAt,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;

  try {
    if (req.method === "POST" && url.pathname === "/__mock/mint-claim") {
      const { code, agentId } = mintClaim();
      sendJson(res, 200, { code, agentId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/agent/claim") {
      const rawCode = body?.code;
      const code = typeof rawCode === "string" ? rawCode.trim().toLowerCase() : "";
      const claim = claims.get(code);
      if (!claim || claim.claimedAt || claim.expiresAt < Date.now()) {
        sendJson(res, 400, { error: "This claim code is invalid, already used, or expired.", code: "claim_invalid" });
        return;
      }
      const agent = agentsById.get(claim.agentId);
      if (!agent) {
        sendJson(res, 400, { error: "This claim code is invalid, already used, or expired.", code: "claim_invalid" });
        return;
      }

      const apiKey = `cdk_test_${randomBase62(43)}`;
      agent.apiKey = apiKey;
      agent.onboardingState = "claimed";
      claim.claimedAt = new Date().toISOString();

      sendJson(res, 200, {
        apiKey,
        agent: agentIdentity(agent),
        api: { baseUrl: `http://localhost:${PORT}`, apiPrefix: "/api" },
        wallet: { required: true, network: "hedera-testnet", suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS },
        owner: { id: "mock-owner", email: "operator@example.com" },
      });
      return;
    }

    const agent = authenticate(req);

    if (req.method === "POST" && url.pathname === "/api/v1/agent/wallet") {
      if (!agent) {
        sendJson(res, 401, { error: "Authentication failed.", code: "unauthenticated" });
        return;
      }
      if (containsPrivateKeyField(body)) {
        sendJson(res, 400, { error: "A private key must never be sent to the backend.", code: "private_key_rejected" });
        return;
      }
      const evmAddress = typeof body?.evmAddress === "string" ? body.evmAddress.toLowerCase() : "";
      if (!/^0x[0-9a-f]{40}$/.test(evmAddress)) {
        sendJson(res, 400, { error: "Invalid EVM address.", code: "wallet_invalid" });
        return;
      }
      if (agent.wallet && agent.wallet.evmAddress !== evmAddress) {
        sendJson(res, 409, { error: "A different wallet is already registered.", code: "wallet_already_registered" });
        return;
      }
      if (!agent.wallet) {
        agent.wallet = {
          evmAddress,
          publicKey: typeof body?.publicKey === "string" ? body.publicKey : "",
          network: typeof body?.network === "string" ? body.network : "hedera-testnet",
          accountId: null,
          balanceTinybars: "0",
          funded: false,
          activated: false,
        };
        agent.onboardingState = "wallet";
      }
      sendJson(res, 200, {
        agent: { id: agent.id, status: agent.status, onboardingState: agent.onboardingState },
        wallet: {
          evmAddress: agent.wallet.evmAddress,
          accountId: agent.wallet.accountId,
          network: agent.wallet.network,
          balanceTinybars: agent.wallet.balanceTinybars,
          funded: agent.wallet.funded,
          suggestedFundingTinybars: SUGGESTED_FUNDING_TINYBARS,
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/agent/me") {
      if (!agent) {
        sendJson(res, 401, { error: "Authentication failed.", code: "unauthenticated" });
        return;
      }
      if (agent.status === "revoked") {
        sendJson(res, 401, { error: "This agent's API key has been revoked.", code: "key_revoked" });
        return;
      }

      if (agent.wallet && !agent.wallet.funded) {
        const mirror = await fetchMirrorAccount(agent.wallet.evmAddress);
        if (mirror?.account) {
          agent.wallet.accountId = mirror.account;
          agent.wallet.balanceTinybars = String(mirror.balance?.balance ?? "0");
          agent.wallet.funded = true;
          agent.onboardingState = "funded";
        }
      } else if (agent.wallet?.accountId) {
        const mirror = await fetchMirrorAccount(agent.wallet.accountId);
        if (mirror?.balance?.balance !== undefined) {
          agent.wallet.balanceTinybars = String(mirror.balance.balance);
        }
      }

      sendJson(res, 200, {
        agent: agentIdentity(agent),
        wallet: agent.wallet
          ? {
              evmAddress: agent.wallet.evmAddress,
              accountId: agent.wallet.accountId,
              network: agent.wallet.network,
              balanceTinybars: agent.wallet.balanceTinybars,
              funded: agent.wallet.funded,
              activated: agent.wallet.activated,
            }
          : { evmAddress: "", accountId: null, network: "hedera-testnet", balanceTinybars: "0", funded: false, activated: false },
        owner: { id: "mock-owner", email: "operator@example.com" },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/agent/activate") {
      if (!agent) {
        sendJson(res, 401, { error: "Authentication failed.", code: "unauthenticated" });
        return;
      }
      if (!agent.wallet?.accountId) {
        sendJson(res, 400, { error: "This agent's wallet is not funded yet.", code: "not_funded" });
        return;
      }
      if (agent.wallet.activated) {
        sendJson(res, 200, { agent: { status: agent.status, onboardingState: agent.onboardingState }, wallet: { activated: true } });
        return;
      }
      const mirror = await fetchMirrorAccount(agent.wallet.accountId);
      if (!mirror || mirror.key == null) {
        sendJson(res, 400, { error: "The account does not have a key yet.", code: "not_activated" });
        return;
      }
      agent.wallet.activated = true;
      agent.status = "active";
      agent.onboardingState = "active";
      sendJson(res, 200, { agent: { status: agent.status, onboardingState: agent.onboardingState }, wallet: { activated: true } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/agent/revoke") {
      if (!agent) {
        sendJson(res, 401, { error: "Authentication failed.", code: "unauthenticated" });
        return;
      }
      agent.status = "revoked";
      agent.onboardingState = "revoked";
      sendJson(res, 200, { revoked: true });
      return;
    }

    sendJson(res, 404, { error: "Not found.", code: "not_found" });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : "Internal error.", code: "server_error" });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`agent-drive mock server listening on http://localhost:${PORT}\n`);
  process.stdout.write(`POST http://localhost:${PORT}/__mock/mint-claim to mint a fresh claim code\n`);
});
