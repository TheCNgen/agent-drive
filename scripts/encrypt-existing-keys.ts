import connectDB from '../app/lib/mongodb';
import User from '../app/models/User';
import { sealKey } from '../app/lib/hedera';

async function main() {
  await connectDB();
  
  // Use collection to get documents so we bypass schema selection rules
  const users = await User.collection.find({ privateKey: { $exists: true } }).toArray();
  
  console.log(`Found ${users.length} users with plaintext private keys.`);
  
  let count = 0;
  for (const user of users) {
    if (user.privateKey) {
      try {
        const encrypted = await sealKey(user.privateKey);
        await User.collection.updateOne(
          { _id: user._id },
          { 
            $set: { encryptedPrivateKey: encrypted },
            $unset: { privateKey: "" }
          }
        );
        count++;
      } catch (err) {
        console.error(`Failed to migrate user ${user._id}:`, err);
      }
    }
  }
  
  console.log(`Successfully migrated ${count} users.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
