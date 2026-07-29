import mongoose from 'mongoose';
import dotenv from 'dotenv';

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
  
  const users = await User.find({ $or: [ { accountId: { $exists: false } }, { accountId: null } ] });
  
  let i = 0;
  for (const user of users) {
    i++;
    user.accountId = `0.0.1234${i}`;
    user.wallet = `0.0.1234${i}`;
    user.privateKey = '302e020100300506032b6570042204201111111111111111111111111111111111111111111111111111111111111111';
    await user.save();
  }
  
  console.log('Updated users:', i);
  await mongoose.disconnect();
}

fix().catch(console.error);
