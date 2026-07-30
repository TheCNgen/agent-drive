import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const topicId = "0.0.9742216";
  const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=5&order=desc`);
  const data = await res.json();
  
  if (!data.messages) {
    console.log("No messages");
    return;
  }
  
  for (const msg of data.messages) {
    const decoded = Buffer.from(msg.message, 'base64').toString('utf8');
    console.log(msg.consensus_timestamp, decoded);
  }
}

main().catch(console.error);
