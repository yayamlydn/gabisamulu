// src/utils/logger.js
const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

// Resolve log path — use env or fallback to ./logs
const logFile   = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'bot.log');
const errorFile = path.join(path.dirname(logFile), 'error.log');

// Ensure log directory exists (storage.js runs first, but be defensive)
const logDir = path.dirname(logFile);
try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) =>
      stack
        ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFile,   maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
    new winston.transports.File({ filename: errorFile, level: 'error' })
  ]
});

module.exports = logger;
