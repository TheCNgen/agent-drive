import { Client, ContractCreateFlow } from '@hiero-ledger/sdk';
import * as fs from 'fs';

const operatorId = "0.0.9742210";
const operatorKey = "302e020100300506032b6570042204209a5fbc2342f67bb10b7f708a9afa44b3acc62e637c7eab7244f55341fd1878ee";

async function main() {
  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  const bytecode = fs.readFileSync('../contracts/bin/contracts_CashDriveTreasury_sol_CashDriveTreasury.bin', 'utf8');

  console.log("Deploying contract...");
  const contractCreate = new ContractCreateFlow()
    .setGas(1000000)
    .setBytecode(bytecode);
    
  const txResponse = await contractCreate.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newContractId = receipt.contractId;
  
  console.log("Contract deployed!");
  console.log(`Contract ID: ${newContractId}`);
  console.log(`Contract EVM Address: ${newContractId!.toSolidityAddress()}`);
  process.exit(0);
}
main();
