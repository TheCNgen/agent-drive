import { Client, PrivateKey, AccountCreateTransaction, Hbar, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

let client: Client;

export function getHederaClient(): Client {
  if (client) {
    return client;
  }
  
  client = Client.forTestnet();
  
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error('Hedera operator configuration missing from environment variables.');
  }

  client.setOperator(operatorId, operatorKey);
  return client;
}

export async function createHederaAccount(): Promise<{ accountId: string; privateKey: string; evmAddress: string }> {
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
    privateKey: newAccountPrivateKey.toStringRaw(), // Storing as hex string
    evmAddress
  };
}

export async function submitHCSRecord(event: string, payload: any): Promise<string> {
  const topicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (!topicId) {
    console.warn("HEDERA_HCS_TOPIC_ID is not set, skipping HCS submission");
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
