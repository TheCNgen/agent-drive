import { config } from "dotenv";
config({ path: "web/.env" });
import { submitHCSRecord } from "./web/app/lib/hedera";

async function main() {
  console.log("Submitting test record...");
  const txId = await submitHCSRecord("TEST_EVENT", { test: "data", owner: "test-user-id" });
  console.log("Tx ID:", txId);
}

main().catch(console.error);
