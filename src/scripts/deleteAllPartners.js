import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Norozz';

async function deleteAllPartners() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Count partners before deletion
    const count = await usersCollection.countDocuments({ role: 'partner' });
    console.log(`Found ${count} partners to delete.`);

    if (count === 0) {
      console.log('No partners found. Exiting.');
      process.exit(0);
    }

    // Delete all partners
    const result = await usersCollection.deleteMany({ role: 'partner' });
    console.log(`Successfully deleted ${result.deletedCount} partners.`);

    process.exit(0);
  } catch (err) {
    console.error('Error deleting partners:', err);
    process.exit(1);
  }
}

deleteAllPartners();
