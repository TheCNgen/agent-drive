import { AccountCreateTransaction, PrivateKey } from '@hiero-ledger/sdk';

const tx = new AccountCreateTransaction();
const key = PrivateKey.generateECDSA();
console.log(tx.setAlias.toString());
