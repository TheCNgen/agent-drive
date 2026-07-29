import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  accountId: String,
  privateKey: String,
  wallet: String
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');
  
  const buyerEmail = fs.readFileSync('tests/.auth/buyer-email.txt', 'utf8').trim();
  
  // First reset any user who already has the operator ID
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  await User.updateMany(
    { wallet: operatorId, email: { $ne: buyerEmail } },
    { 
      $set: { 
        wallet: `0.0.999${Date.now()}`,
        accountId: `0.0.999${Date.now()}`
      } 
    }
  );
  
  // Then update the specific buyer user
  const result = await User.updateOne(
    { email: buyerEmail },
    { 
      $set: { 
        accountId: process.env.HEDERA_OPERATOR_ID, 
        privateKey: process.env.HEDERA_OPERATOR_KEY,
        wallet: process.env.HEDERA_OPERATOR_ID
      } 
    }
  );
  
  console.log('Updated buyer user:', result.modifiedCount);
  await mongoose.disconnect();
}

fix().catch(console.error);
