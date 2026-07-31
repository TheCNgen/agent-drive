import { Client, ContractCreateFlow, PrivateKey, AccountId } from "@hiero-ledger/sdk";
import * as fs from "fs";

async function main() {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
        throw new Error("Must set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY");
    }

    const client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);

    console.log("Reading contract bytecode...");
    const bytecodeStr = fs.readFileSync("contracts/build/contracts_CashDriveTreasury_sol_CashDriveTreasury.bin", "utf8");

    console.log("Deploying contract...");
    const contractCreate = new ContractCreateFlow()
        .setBytecode(bytecodeStr)
        .setGas(1000000);

    const txResponse = await contractCreate.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const newContractId = receipt.contractId;

    console.log("Smart Contract deployed successfully!");
    console.log(`Contract ID: ${newContractId}`);
    console.log(`Contract EVM Address: 0x${newContractId?.toSolidityAddress()}`);
    
    process.exit(0);
}

main().catch(console.error);
