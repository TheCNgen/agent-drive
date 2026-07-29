import { KeyManagementServiceClient } from '@google-cloud/kms';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const kms = new KeyManagementServiceClient();
    console.log("Client created successfully. Trying to use it...");
    // Just try a dummy request or see if initialization itself hangs.
    const [res] = await kms.encrypt({
      name: 'projects/oe-dev-env-2026/locations/europe-west1/keyRings/cashdrive-ring/cryptoKeys/user-wallet-keys',
      plaintext: Buffer.from('test', 'utf8'),
    });
    console.log("Success:", res);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
