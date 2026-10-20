import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Norozz';

async function deleteAllCityAdmins() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const count = await usersCollection.countDocuments({ role: 'cityAdmin' });
    console.log(`Found ${count} cityAdmins to delete.`);

    if (count === 0) {
      console.log('No cityAdmins found. Exiting.');
      process.exit(0);
    }

    const result = await usersCollection.deleteMany({ role: 'cityAdmin' });
    console.log(`Successfully deleted ${result.deletedCount} cityAdmins.`);

    process.exit(0);
  } catch (err) {
    console.error('Error deleting cityAdmins:', err);
    process.exit(1);
  }
}

deleteAllCityAdmins();
