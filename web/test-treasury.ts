import { Client, PrivateKey, AccountCreateTransaction, Hbar, ContractExecuteTransaction, ContractFunctionParameters, ContractCallQuery, TransferTransaction, AccountId, AccountBalanceQuery } from '@hiero-ledger/sdk';

const operatorId = "0.0.9742210";
const operatorKey = "302e020100300506032b6570042204209a5fbc2342f67bb10b7f708a9afa44b3acc62e637c7eab7244f55341fd1878ee";
const contractId = "0.0.9832974";

async function main() {
  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  console.log("Creating Seller and Affiliate accounts...");
  
  // Seller Account
  const sellerKey = PrivateKey.generateECDSA();
  const sellerEvmAddress = `0x${sellerKey.publicKey.toEvmAddress()}`;
  let txResponse = await new AccountCreateTransaction()
    .setKey(sellerKey.publicKey)
    .setAlias(sellerEvmAddress)
    .setInitialBalance(new Hbar(1))
    .execute(client);
  let receipt = await txResponse.getReceipt(client);
  const sellerAccountId = receipt.accountId;
  console.log(`Seller Account: ${sellerAccountId}, EVM: ${sellerEvmAddress}`);

  // Affiliate Account
  const affiliateKey = PrivateKey.generateECDSA();
  const affiliateEvmAddress = `0x${affiliateKey.publicKey.toEvmAddress()}`;
  txResponse = await new AccountCreateTransaction()
    .setKey(affiliateKey.publicKey)
    .setAlias(affiliateEvmAddress)
    .setInitialBalance(new Hbar(1))
    .execute(client);
  receipt = await txResponse.getReceipt(client);
  const affiliateAccountId = receipt.accountId;
  console.log(`Affiliate Account: ${affiliateAccountId}, EVM: ${affiliateEvmAddress}`);

  console.log("\nx402 Client transferring HBAR to Treasury Contract...");
  const transferTx = await new TransferTransaction()
    .addHbarTransfer(client.operatorAccountId!, new Hbar(-0.015))
    .addHbarTransfer(AccountId.fromString(contractId), new Hbar(0.015))
    .execute(client);
  await transferTx.getReceipt(client);

  const contractBalanceQuery = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(contractId))
    .execute(client);
  console.log(`Contract Balance before allocation: ${contractBalanceQuery.hbars.toString()}`);

  console.log("\nAdmin allocating funds in the Treasury Contract...");
  const sellerAmountTinybars = BigInt(1000000); // 0.01 HBAR
  const affiliateAmountTinybars = BigInt(500000); // 0.005 HBAR
  
  const allocateTx = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(250000)
    .setFunction(
      'allocate',
      new ContractFunctionParameters()
        .addAddress(sellerEvmAddress)
        .addAddress(affiliateEvmAddress)
        .addUint256(sellerAmountTinybars.toString())
        .addUint256(affiliateAmountTinybars.toString())
    );
    
  try {
    const allocateRes = await allocateTx.execute(client);
    const allocateReceipt = await allocateRes.getReceipt(client);
    console.log(`Allocation successful! Status: ${allocateReceipt.status.toString()}`);
  } catch(e) {
    console.error("Allocation failed:", e);
    process.exit(1);
  }

  console.log("\nQuerying Seller Balance in Contract...");
  try {
    const query = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(100000)
      .setFunction("balances", new ContractFunctionParameters().addAddress(sellerEvmAddress));
    const queryRes = await query.execute(client);
    const balance = queryRes.getUint256(0);
    console.log(`Seller Balance: ${balance.toString()} tinybars`);
  } catch(e) {
    console.error("Query failed:", e);
  }

  console.log("\nQuerying Affiliate Balance in Contract...");
  try {
    const query = new ContractCallQuery()
      .setContractId(contractId)
      .setGas(100000)
      .setFunction("balances", new ContractFunctionParameters().addAddress(affiliateEvmAddress));
    const queryRes = await query.execute(client);
    const balance = queryRes.getUint256(0);
    console.log(`Affiliate Balance: ${balance.toString()} tinybars`);
  } catch(e) {
    console.error("Query failed:", e);
  }

  console.log("\nSeller claiming funds...");
  // Connect as seller
  const sellerClient = Client.forTestnet();
  sellerClient.setOperator(sellerAccountId!, sellerKey);
  
  const claimTx = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(250000)
    .setFunction('claim');
    
  try {
    const claimRes = await claimTx.execute(sellerClient);
    const claimReceipt = await claimRes.getReceipt(sellerClient);
    console.log(`Claim successful! Status: ${claimReceipt.status.toString()}`);
  } catch(e) {
    console.error("Claim failed:", e);
  }

  console.log("\nDone!");
  process.exit(0);
}

main();
