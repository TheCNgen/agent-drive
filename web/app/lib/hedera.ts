import { Client, PrivateKey, AccountCreateTransaction, Hbar, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { config } from './config';

const kmsOptions: any = {};
if (process.env.GCP_CREDENTIALS_B64) {
  try {
    const creds = JSON.parse(Buffer.from(process.env.GCP_CREDENTIALS_B64, 'base64').toString('utf8'));
    kmsOptions.credentials = {
      client_email: creds.client_email,
      private_key: creds.private_key,
    };
    kmsOptions.projectId = creds.project_id;
  } catch (e) {
    console.error('Failed to parse GCP_CREDENTIALS_B64', e);
  }
}
const kms = new KeyManagementServiceClient(kmsOptions);

let client: Client;

export function getHederaClient(): Client {
  if (client) {
    return client;
  }
  
  client = Client.forTestnet();
  
  const operatorId = config.hedera.operatorId;
  const operatorKey = config.hedera.operatorKey;

  if (!operatorId || !operatorKey) {
    throw new Error('Hedera operator configuration missing from environment variables.');
  }

  client.setOperator(operatorId, operatorKey);
  return client;
}

export async function sealKey(plaintext: string): Promise<string> {
  const [res] = await kms.encrypt({
    name: config.kms.keyName,
    plaintext: Buffer.from(plaintext, 'utf8'),
  });
  return Buffer.from(res.ciphertext as Uint8Array).toString('base64');
}

export async function unsealKey(ciphertextB64: string): Promise<string> {
  const [res] = await kms.decrypt({
    name: config.kms.keyName,
    ciphertext: Buffer.from(ciphertextB64, 'base64'),
  });
  return Buffer.from(res.plaintext as Uint8Array).toString('utf8');
}

export async function createHederaAccount(): Promise<{ accountId: string; encryptedPrivateKey: string; evmAddress: string }> {
  const newAccountPrivateKey = PrivateKey.generateECDSA();
  const newAccountPublicKey = newAccountPrivateKey.publicKey;
  const evmAddress = `0x${newAccountPublicKey.toEvmAddress()}`;

  const transaction = new AccountCreateTransaction()
    .setKey(newAccountPublicKey)
    .setInitialBalance(new Hbar(10)); // Provide initial balance for gas and transactions

  const client = getHederaClient();
  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const newAccountId = receipt.accountId;

  if (!newAccountId) {
    throw new Error('Failed to create Hedera account');
  }

  return {
    accountId: newAccountId.toString(),
    encryptedPrivateKey: await sealKey(newAccountPrivateKey.toStringRaw()),
    evmAddress
  };
}

export async function submitHCSRecord(event: string, payload: any): Promise<string> {
  const topicId = config.hedera.provenanceTopicId;
  if (!topicId) {
    console.warn("provenanceTopicId is not set, skipping HCS submission");
    return "";
  }

  const client = getHederaClient();
  const message = {
    event,
    timestamp: Date.now(),
    ...payload
  };

  try {
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message));

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    
    return txResponse.transactionId.toString();
  } catch (error) {
    console.error("Failed to submit HCS record:", error);
    return "";
  }
}

export async function allocateTreasuryFunds(
  sellerWallet: string,
  affiliateWallet: string | null | undefined,
  sellerAmountTinybars: bigint,
  affiliateAmountTinybars: bigint
): Promise<string> {
  const contractId = config.payments.treasuryContractId;
  if (!contractId) {
    throw new Error('Treasury contract ID not configured');
  }

  const { ContractExecuteTransaction, ContractFunctionParameters } = await import('@hiero-ledger/sdk');

  const client = getHederaClient();
  const safeAffiliateWallet = affiliateWallet || '0x0000000000000000000000000000000000000000';

  const transaction = new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(250000)
    .setFunction(
      'allocate',
      new ContractFunctionParameters()
        .addAddress(sellerWallet)
        .addAddress(safeAffiliateWallet)
        .addUint256(Number(sellerAmountTinybars))
        .addUint256(Number(affiliateAmountTinybars))
    );

  try {
    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    return txResponse.transactionId.toString();
  } catch (error) {
    console.error("Failed to allocate treasury funds:", error);
    throw error;
  }
}
