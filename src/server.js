import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config/env.config.js';
import app from './app.js';
import { initDatabase } from './database/index.js';
import { initSockets } from './sockets/index.js';
import { initCronJobs } from './cron/index.js';

const PORT = process.env.PORT || 5000;

// Catch Uncaught Exceptions
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Port ${PORT} is busy. Releasing socket...`);
    process.exit(1);
  }
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Initialize Database & Server Startup
const startServer = async () => {
  validateEnv();
  await initDatabase();

  const server = app.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 NOROZZ Backend Server Running on Port ${PORT}`);
    console.log(`📖 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`⚠️ Port ${PORT} is already in use. Please wait 1 second or kill old node process.`);
      process.exit(1);
    }
  });

  // Initialize Socket.io & Cron Jobs
  initSockets(server);
  initCronJobs();

  // Graceful Shutdown Handler Helper
  const shutdown = (signal) => {
    console.log(`\nRECEIVED ${signal}. Gracefully closing HTTP server...`);
    server.close(() => {
      console.log('HTTP Server closed successfully.');
      if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2');
      } else {
        process.exit(0);
      }
    });
  };

  // Listen for nodemon restart (SIGUSR2) & termination signals (SIGINT, SIGTERM)
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled promise rejections are logged but must not take the whole API down for every customer
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION (server kept alive):', err);
  });
};

startServer();
