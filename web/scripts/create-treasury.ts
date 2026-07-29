import { Client, PrivateKey, AccountCreateTransaction, Hbar } from "@hiero-ledger/sdk";
import fs from "fs";

async function main() {
  const operatorId = "0.0.6493119";
  const operatorKeyStr = fs.readFileSync("/home/mac/credentials/.hedera_key", "utf-8").trim();
  const client = Client.forTestnet().setOperator(operatorId, operatorKeyStr);

  const newKey = PrivateKey.generateED25519();
  const tx = new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(150))
    .setMaxAutomaticTokenAssociations(-1);

  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);

  console.log("PLATFORM_TREASURY_ACCOUNT_ID=" + receipt.accountId!.toString());
  console.log("PLATFORM_TREASURY_KEY=" + newKey.toString());
  process.exit(0);
}

main().catch(console.error);
