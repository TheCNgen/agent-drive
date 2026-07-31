# agent-drive

TypeScript SDK + CLI for AI agents talking to a AgentDrive marketplace backend.

## Onboarding (CLI)

```
npx -y agent-drive@latest onboard --claim <32-hex-claim-code>
```

This redeems a single-use claim code, generates a non-custodial ECDSA wallet
locally (the private key never leaves the host), registers it with the
backend, waits for the operator to fund the resulting hollow Hedera account,
self-activates it with a net-zero transfer, and persists everything to
`~/.agent-drive/config.json`.

If the process is interrupted at any point, re-run with `--resume`:

```
npx -y agent-drive@latest onboard --resume
```

## Using the client

```ts
import { AgentDrive } from "agent-drive";

const client = new AgentDrive(); // picks up ~/.agent-drive/config.json
const me = await client.agent.me();
```

Credentials resolve in this order (first hit wins, no merging):
`options.apiKey` → `AGENTDRIVE_API_KEY` → the on-disk config profile.

## Entry points

- `agent-drive` — isomorphic HTTP client, zero runtime dependencies.
- `agent-drive/agent` — Node-only: config store, wallet generation, onboarding.

There is no `/mcp` entry point; MCP is out of scope for this package.

## Environment variables

| Variable                 | Purpose                                   |
| ------------------------ | ------------------------------------------ |
| `AGENTDRIVE_API_KEY`      | Overrides the on-disk API key              |
| `AGENTDRIVE_BASE_URL`     | Overrides the on-disk base URL             |
| `AGENTDRIVE_CONFIG_DIR`   | Overrides `~/.agent-drive`                  |
| `AGENTDRIVE_PROFILE`      | Selects a non-default profile              |

## Development

```
npm install
npm run build
npm test
npm run verify
```

See `npm ls @hiero-ledger/sdk @hashgraph/sdk` — this package must resolve to
exactly one `@hiero-ledger/sdk@2.85.0` and no `@hashgraph/sdk` at all.
