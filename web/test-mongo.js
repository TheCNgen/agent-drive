const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://appuser:apppassword@cachedrive-dev.uhivqfv.mongodb.net/cachedrive";

async function run() {
  console.log("Connecting...");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected successfully to server");
    const db = client.db("cachedrive");
    const ping = await db.command({ ping: 1 });
    console.log("Ping successful:", ping);
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
