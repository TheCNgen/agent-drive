import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const userSchema = new mongoose.Schema({
  email: String,
  name: String
}, { collection: 'users' });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const users = await User.find({});
    console.log(`Found ${users.length} users in database:`);
    users.forEach(u => console.log(`- ${u.email}`));
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

checkUsers();
