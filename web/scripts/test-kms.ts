import { sealKey, unsealKey } from '../app/lib/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

async function main() {
  const pk = PrivateKey.generateECDSA();
  const rawHex = pk.toStringRaw();
  console.log("Raw hex:", rawHex);

  const sealed = await sealKey(rawHex);
  console.log("Sealed:", sealed);

  const unsealed = await unsealKey(sealed);
  console.log("Unsealed:", unsealed);

  if (rawHex !== unsealed) {
    throw new Error("KMS round-trip failed");
  }

  const pkRecreated = PrivateKey.fromStringECDSA(unsealed);
  if (pk.publicKey.toStringRaw() !== pkRecreated.publicKey.toStringRaw()) {
    throw new Error("Public keys do not match");
  }

  console.log("KMS round-trip and ECDSA parsing successful.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
