import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, PrivateKey } from "@hiero-ledger/sdk";
import fs from "fs";

// A small loader for .env so this works as a standalone script
import { config } from "dotenv";
config({ path: ".env" });

import { config as appConfig } from "../app/lib/config";

async function main() {
  const operatorId = appConfig.hedera.operatorId!;
  const operatorKey = appConfig.hedera.operatorKey!;
  const treasuryId = appConfig.payments.treasuryAccountId!;

  console.log("Bootstrap Hedera Script");
  console.log("-----------------------");
  const client = Client.forTestnet().setOperator(operatorId, operatorKey);

  // 1. Verify operator + treasury accounts exist and print balances
  try {
    const operatorInfo = await fetch(`${appConfig.hedera.mirrorNodeUrl}/api/v1/accounts/${operatorId}`).then(r => r.json());
    console.log(`Operator Balance (${operatorId}): ${operatorInfo.balance?.balance} tinybars`);

    const treasuryInfo = await fetch(`${appConfig.hedera.mirrorNodeUrl}/api/v1/accounts/${treasuryId}`).then(r => r.json());
    console.log(`Treasury Balance (${treasuryId}): ${treasuryInfo.balance?.balance} tinybars`);
  } catch (e) {
    console.error("Failed to fetch balances from mirror node", e);
  }

  // 2. If HCS_PROVENANCE_TOPIC_ID is empty or doesn't exist, create it.
  let topicId = appConfig.hedera.provenanceTopicId;
  let topicExists = false;

  if (topicId) {
    const topicRes = await fetch(`${appConfig.hedera.mirrorNodeUrl}/api/v1/topics/${topicId}`);
    if (topicRes.status === 200) {
      topicExists = true;
      console.log(`Topic ${topicId} exists.`);
    }
  }

  if (!topicExists) {
    console.log("Topic does not exist or not provided in .env. Creating...");
    const operatorPrivKey = PrivateKey.fromStringECDSA(operatorKey);
    // Wait, the operator key from .env might be ED25519 or ECDSA.
    // PrivateKey.fromString() handles both.
    const privKey = PrivateKey.fromString(operatorKey);
    
    const tx = new TopicCreateTransaction()
      .setTopicMemo("cachedrive-provenance-v1")
      .setSubmitKey(privKey.publicKey);
    
    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);
    topicId = receipt.topicId!.toString();
    console.log(`\nCREATED TOPIC: ${topicId}`);
    console.log(`\n=> ACTION REQUIRED: Add HCS_PROVENANCE_TOPIC_ID=${topicId} to .env\n`);
    
    // Update .env file automatically for convenience in this dev build
    const envContent = fs.readFileSync(".env", "utf-8");
    fs.writeFileSync(".env", envContent.replace(/HCS_PROVENANCE_TOPIC_ID=.*/, `HCS_PROVENANCE_TOPIC_ID=${topicId}`));
    appConfig.hedera.provenanceTopicId = topicId;
  }

  // 3. Submit a BOOTSTRAP_PING message and read it back
  console.log(`Submitting BOOTSTRAP_PING to topic ${topicId}...`);
  const submitTx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId!)
    .setMessage("BOOTSTRAP_PING");
  
  const submitResp = await submitTx.execute(client);
  await submitResp.getReceipt(client);

  console.log("Waiting 3 seconds for mirror node sync...");
  await new Promise(r => setTimeout(r, 3000));

  const msgsRes = await fetch(`${appConfig.hedera.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=1&order=desc`);
  const msgsJson = await msgsRes.json();

  if (msgsJson.messages && msgsJson.messages.length > 0) {
    const msg = msgsJson.messages[0];
    const decoded = Buffer.from(msg.message, 'base64').toString('utf8');
    console.log(`Read from Mirror Node: [${decoded}] at ${msg.consensus_timestamp}`);
    if (decoded === "BOOTSTRAP_PING") {
      console.log("✅ Write -> Mirror path verified successfully.");
    } else {
      console.warn("⚠️ Read a message, but it was not BOOTSTRAP_PING: " + decoded);
    }
  } else {
    console.error("❌ Failed to read message from Mirror Node.");
  }

  process.exit(0);
}

main().catch(console.error);
