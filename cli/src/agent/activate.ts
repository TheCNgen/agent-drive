import { AccountId, Client, Hbar, PrivateKey, Status, TransferTransaction } from "@hiero-ledger/sdk";
import { ActivationError } from "../errors.js";
import type { HederaNetwork } from "../types/agent.js";

export interface ActivateAccountOptions {
  accountId: string;
  privateKey: string;
  network: HederaNetwork;
}

export interface ActivateAccountResult {
  transactionId: string;
}

export const ACTIVATION_RETRY_MESSAGE =
  "The agent's Hedera account could not be activated. Run `cash-drive onboard --resume` to retry.";
const RETRY_MESSAGE = ACTIVATION_RETRY_MESSAGE;

function buildClient(network: HederaNetwork): Client {
  switch (network) {
    case "hedera-testnet":
      return Client.forTestnet();
    case "hedera-mainnet":
      return Client.forMainnet();
    default:
      throw new ActivationError(`Unsupported network "${network as string}".`);
  }
}

/**
 * Completes a hollow account with a net-zero self-transfer: the hollow account is both
 * the fee payer and the sole signer, the only combination the network will accept from
 * an account that has no key yet. This is the one Hedera transaction this stage submits.
 *
 * Does not retry on failure -- a failed activation is probably not transient, and looping
 * would just burn the agent's balance on fees.
 */
export async function activateAccount(options: ActivateAccountOptions): Promise<ActivateAccountResult> {
  const key = PrivateKey.fromStringECDSA(options.privateKey);
  const account = AccountId.fromString(options.accountId);
  const client = buildClient(options.network);
  client.setOperator(account, key);

  try {
    const tx = await new TransferTransaction()
      .addHbarTransfer(account, Hbar.fromTinybars(-1))
      .addHbarTransfer(account, Hbar.fromTinybars(1))
      .freezeWith(client)
      .sign(key);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const transactionId = response.transactionId.toString();

    if (receipt.status !== Status.Success) {
      throw new ActivationError(RETRY_MESSAGE, {
        body: { accountId: options.accountId, transactionId, status: receipt.status.toString() },
      });
    }

    return { transactionId };
  } catch (err) {
    if (err instanceof ActivationError) throw err;
    throw new ActivationError(RETRY_MESSAGE, { cause: err, body: { accountId: options.accountId } });
  } finally {
    client.close();
  }
}
