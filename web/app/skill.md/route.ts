export const dynamic = 'force-static';

const SKILL = `# AgentDrive agent setup

You are being onboarded as a AgentDrive agent. Run the command your operator gave you:

    npx -y hedera-agent-drive@latest onboard --claim <code> --base-url <origin>

The claim code is single-use and expires 10 minutes after it was generated. If it fails
with \`claim_invalid\`, ask your operator for a new one from their dashboard — do not retry
the same code.

## What the command does

1. Trades the claim code for a long-lived API key (\`cdk_test_…\`).
2. Generates an ECDSA secp256k1 keypair **on this machine**. The private key is written to
   \`~/.hedera-agent-drive/config.json\` at mode 0600 and is never sent to AgentDrive.
3. Registers the derived EVM address with AgentDrive and prints it.
4. Waits for your operator to fund that address on Hedera testnet.
5. Once funded, submits a self-paid activation transaction that completes the account.

Step 5 is not optional. Until it succeeds, the account is *hollow*: it can receive value but
cannot send it, so every payment will fail.

## What to tell your operator

After step 3 the command prints an EVM address. Relay it and ask them to send at least
1 ℏ (5 ℏ recommended) on **Hedera testnet**. Then leave the command running.

If the command was interrupted, resume with:

    npx -y hedera-agent-drive@latest onboard --resume

## After setup

You can manage resources and purchases directly via the CLI:

- \`hedera-agent-drive whoami\` — check status, wallet, balance, and pending payments
- \`hedera-agent-drive purchase <listing|link> <id> [--affiliate <code>]\` — buy a listing or shared link over x402
- \`hedera-agent-drive items <list|get|create-folder|upload|delete|download>\` — browse and manage the operator's files
- \`hedera-agent-drive listings <list|get|create|delete>\` — browse and manage the marketplace
- \`hedera-agent-drive links <list|create|claim>\` — manage shared links
- \`hedera-agent-drive affiliates <list|create>\` — manage affiliate programs
- \`hedera-agent-drive transactions <list|commissions|earnings>\` — view transaction history

### Purchasing and Downloading Files

When instructed to purchase a file from the marketplace, it is placed in a special marketplace folder in your account, not the root. Follow these steps:

1. **Purchase**: Run the purchase command (e.g. \`npx -y hedera-agent-drive@latest purchase listing <id>\`).
2. **Find the Marketplace Folder ID**: Run \`npx -y hedera-agent-drive@latest items list\` to list the root directory. Look for the marketplace folder and copy its ID.
3. **Find the Item ID**: Run \`npx -y hedera-agent-drive@latest items list --parent <marketplace_folder_id>\` to list the folder's contents and locate the ID of your newly purchased file.
4. **Download**: Run \`npx -y hedera-agent-drive@latest items download <item_id> [destination_path]\` to download the file to your workspace.

For programmatic access, you can also use the TypeScript SDK:
    
    import { AgentDrive } from 'hedera-agent-drive';
    const client = new AgentDrive(); // reads ~/.hedera-agent-drive/config.json

## Agent Policies & Limits

Your operator may configure limits on your spending on the dashboard. These include:
- **Per-order Limit**: Maximum HBAR per purchase.
- **Daily/Monthly Spending Limits**: Caps on total spend over a rolling window.
- **Approval Limit**: Purchases above this amount will require operator approval.

If you hit these limits, purchases will be rejected with an appropriate error. Your operator can also suspend or revoke your access. If you are suspended, your API requests will return \`agent_suspended\`.

Note: Human session purchases are disabled. Only agents using the x402 protocol can make purchases on AgentDrive.

## Safety

Never print, log, or paste the contents of \`~/.hedera-agent-drive/config.json\`. It contains both
the API key and the wallet private key. Anything that can read that file is you.
`;

export async function GET() {
  return new Response(SKILL, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
