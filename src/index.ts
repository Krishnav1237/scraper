import { initializeDatabase } from './db/schema.js';
import { startServer } from './web/server.js';
import { startScheduler } from './scheduler/jobs.js';
import { logger } from './core/logger.js';
import { config } from './config.js';

async function main() {
  logger.info('='.repeat(50));
  logger.info(`${config.appName}`);
  logger.info('='.repeat(50));
  
  // Initialize database
  logger.info('Initializing database...');
  initializeDatabase();
  
  // Start web server
  logger.info('Starting web server...');
  startServer();
  
  // Start scheduler
  logger.info('Starting scheduler...');
  startScheduler();
  
  logger.info('');
  logger.info('✅ System is running!');
  logger.info('');
  logger.info(`Dashboard: http://localhost:${config.port}`);
  logger.info('');
  logger.info('Manual scrape commands:');
  logger.info('  npm run scrape:reddit');
  logger.info('  npm run scrape:playstore');
  logger.info('  npm run scrape:appstore');
  logger.info('  npm run scrape:all');
  logger.info('');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

main().catch(error => {
  logger.error('Failed to start:', error);
  process.exit(1);
});
