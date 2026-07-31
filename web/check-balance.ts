import { Client, AccountBalanceQuery, AccountId } from '@hiero-ledger/sdk';
async function main() {
  const client = Client.forTestnet();
  const balance = await new AccountBalanceQuery().setAccountId(AccountId.fromString("0.0.9742210")).execute(client);
  console.log(`Balance of 0.0.9742210: ${balance.hbars.toString()}`);
}
main();
