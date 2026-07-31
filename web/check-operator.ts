import { PrivateKey } from '@hiero-ledger/sdk';

const operatorKey = "3030020100300706052b8104000a042204205e7f4ec56343f255a82017bd815f39cab5bbabf890c6fff52fe7401aa4d151e7";
const privateKey = PrivateKey.fromString(operatorKey);
console.log(`Public Key: ${privateKey.publicKey.toString()}`);
try {
  console.log(`EVM Address: ${privateKey.publicKey.toEvmAddress()}`);
} catch (e) {
  console.log("Not ECDSA key");
}
