export const dynamic = 'force-static';

const SKILL = `# CashDrive agent setup

You are being onboarded as a CashDrive agent. Run the command your operator gave you:

    npx -y cash-drive@latest onboard --claim <code> --base-url <origin>

The claim code is single-use and expires 10 minutes after it was generated. If it fails
with \`claim_invalid\`, ask your operator for a new one from their dashboard — do not retry
the same code.

## What the command does

1. Trades the claim code for a long-lived API key (\`cdk_test_…\`).
2. Generates an ECDSA secp256k1 keypair **on this machine**. The private key is written to
   \`~/.cash-drive/config.json\` at mode 0600 and is never sent to CashDrive.
3. Registers the derived EVM address with CashDrive and prints it.
4. Waits for your operator to fund that address on Hedera testnet.
5. Once funded, submits a self-paid activation transaction that completes the account.

Step 5 is not optional. Until it succeeds, the account is *hollow*: it can receive value but
cannot send it, so every payment will fail.

## What to tell your operator

After step 3 the command prints an EVM address. Relay it and ask them to send at least
1 ℏ (5 ℏ recommended) on **Hedera testnet**. Then leave the command running.

If the command was interrupted, resume with:

    npx -y cash-drive@latest onboard --resume

## After setup

You can manage resources and purchases directly via the CLI:

- \`cash-drive whoami\` — check status, wallet, balance, and pending payments
- \`cash-drive purchase <listing|link> <id> [--affiliate <code>]\` — buy a listing or shared link over x402
- \`cash-drive items <list|get|create-folder|upload|delete|download>\` — browse and manage the operator's files (use \`cash-drive items download <id> [path]\` to download)
- \`cash-drive listings <list|get|create|delete>\` — browse and manage the marketplace
- \`cash-drive links <list|create|claim>\` — manage shared links
- \`cash-drive affiliates <list|create>\` — manage affiliate programs
- \`cash-drive transactions <list|commissions|earnings>\` — view transaction history

For programmatic access, you can also use the TypeScript SDK:
    
    import { CashDrive } from 'cash-drive';
    const client = new CashDrive(); // reads ~/.cash-drive/config.json

## Agent Policies & Limits

Your operator may configure limits on your spending on the dashboard. These include:
- **Per-order Limit**: Maximum HBAR per purchase.
- **Daily/Monthly Spending Limits**: Caps on total spend over a rolling window.
- **Approval Limit**: Purchases above this amount will require operator approval.

If you hit these limits, purchases will be rejected with an appropriate error. Your operator can also suspend or revoke your access. If you are suspended, your API requests will return \`agent_suspended\`.

Note: Human session purchases are disabled. Only agents using the x402 protocol can make purchases on CashDrive.

## Safety

Never print, log, or paste the contents of \`~/.cash-drive/config.json\`. It contains both
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
