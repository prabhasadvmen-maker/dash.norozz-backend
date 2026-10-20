import mongoose from 'mongoose';

/**
 * Connect to MongoDB database instance.
 * Production: the API must not run without its database -> fail fast so the process manager restarts it.
 */
export const connectDB = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is missing.');
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: !isProduction || process.env.MONGO_AUTO_INDEX === 'true',
      serverSelectionTimeoutMS: isProduction ? 10000 : 3000,
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    });
    console.log(`MongoDB Connected Successfully: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    if (isProduction) {
      console.error(`FATAL: MongoDB connection failed: ${error.message}`);
      process.exit(1);
    }
    console.warn(`MongoDB Connection Warning: ${error.message} (Running in Offline/Mock DB Mode)`);
  }
};
