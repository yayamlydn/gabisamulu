// src/utils/storage.js
// Railway Persistent Volume + SQLite Path Manager

const fs = require('fs');
const path = require('path');

/**
 * Railway menyediakan persistent volume di path yang bisa dikonfigurasi.
 * File ini memastikan database & log tersimpan di lokasi yang persisten
 * dan tidak hilang saat redeploy.
 *
 * Setup Railway Persistent Volume:
 * 1. Buka project di Railway dashboard
 * 2. Pergi ke service → Settings → Volumes
 * 3. Add Volume: Mount Path = /app/data
 * 4. Set DATABASE_PATH=/app/data/bot.db di Variables
 */

const ensurePersistentDirs = () => {
  const dbPath = process.env.DATABASE_PATH || './data/bot.db';
  const logFile = process.env.LOG_FILE || './logs/bot.log';

  const dirs = [
    path.dirname(path.resolve(dbPath)),
    path.dirname(path.resolve(logFile))
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[Storage] Created directory: ${dir}`);
    }
  });

  // Railway volume health check
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  if (isRailway) {
    console.log(`[Storage] Railway environment detected`);
    console.log(`[Storage] Database path: ${path.resolve(dbPath)}`);
    console.log(`[Storage] Log path: ${path.resolve(logFile)}`);

    // Warn if using non-persistent path
    if (!dbPath.startsWith('/app/data') && !dbPath.startsWith('/data')) {
      console.warn('[Storage] ⚠️  WARNING: DATABASE_PATH may not be on a persistent volume!');
      console.warn('[Storage] Set DATABASE_PATH=/app/data/bot.db and add a Volume in Railway.');
    }
  }
};

const getDbPath = () => {
  return path.resolve(process.env.DATABASE_PATH || './data/bot.db');
};

const getLogPath = () => {
  return path.resolve(process.env.LOG_FILE || './logs/bot.log');
};

module.exports = { ensurePersistentDirs, getDbPath, getLogPath };
