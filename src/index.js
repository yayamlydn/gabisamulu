// src/index.js  (Railway Production Ready)
// Main Entry Point — Business Verification Telegram Bot

// Load env FIRST before anything else
require('dotenv').config();

// Pastikan direktori persisten ada sebelum apapun diload
const { ensurePersistentDirs } = require('./utils/storage');
ensurePersistentDirs();

const express  = require('express');
const cron     = require('node-cron');
const logger   = require('./utils/logger');
const { initializeDatabase } = require('./database/schema');
const { AdminDB }             = require('./database/queries');
const { createBot }           = require('./bot/index');
const { createWebhookRouter } = require('./payment/webhook');
const { autoCheckExpiredOrders } = require('./services/verification');

// Banner (plain, no ANSI — Railway strips colors in some log views)
console.log('==============================================');
console.log('  Business Verification Telegram Bot v1.0   ');
console.log('  NodeJS | SQLite | Railway Ready            ');
console.log('==============================================');
console.log(`  NODE_ENV : ${process.env.NODE_ENV || 'development'}`);
console.log(`  PORT     : ${process.env.PORT || process.env.BOT_PORT || 3000}`);
console.log(`  DB PATH  : ${process.env.DATABASE_PATH || './data/bot.db'}`);
console.log('==============================================');

// ─────────────────────────────────────────────
// Validate required env vars
// ─────────────────────────────────────────────
const REQUIRED_VARS = ['BOT_TOKEN', 'SUPER_ADMIN_ID'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`\n❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Set them in Railway → Service → Variables\n');
  process.exit(1);
}

// ─────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────
initializeDatabase();
logger.info('Database ready');

const superAdminId = process.env.SUPER_ADMIN_ID;
if (superAdminId && !AdminDB.findById(superAdminId)) {
  AdminDB.add(superAdminId, process.env.SUPER_ADMIN_USERNAME || '', 'Super Admin', 'super_admin', 'system');
  logger.info(`Super Admin registered: ${superAdminId}`);
}

// ─────────────────────────────────────────────
// Bot + Express
// ─────────────────────────────────────────────
const bot = createBot();
const app = express();

// Railway inject PORT otomatis — WAJIB gunakan process.env.PORT
const PORT = parseInt(process.env.PORT || process.env.BOT_PORT || 3000);

app.use('/webhook', createWebhookRouter(bot));

app.get('/health', (_req, res) => res.json({
  status   : 'ok',
  env      : process.env.NODE_ENV || 'development',
  railway  : !!process.env.RAILWAY_ENVIRONMENT,
  uptime   : Math.floor(process.uptime()),
  timestamp: new Date().toISOString()
}));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─────────────────────────────────────────────
// Cron Jobs
// ─────────────────────────────────────────────
cron.schedule('* * * * *', () => autoCheckExpiredOrders(bot));
cron.schedule('0 0 * * *', () => {
  const { StatsDB } = require('./database/queries');
  logger.info(`[Cron] Daily stats: ${JSON.stringify(StatsDB.getSummary())}`);
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const startBot = async () => {
  try {
    const domain     = (process.env.WEBHOOK_DOMAIN || '').trim().replace(/\/$/, '');
    const useWebhook = process.env.NODE_ENV === 'production' && domain;

    if (useWebhook) {
      // ── WEBHOOK MODE (Railway production) ───────────────
      const tokenSafe  = process.env.BOT_TOKEN.replace(':', '_');
      const hookPath   = `/tgbot${tokenSafe}`;
      const hookUrl    = `${domain}${hookPath}`;

      // Register Telegraf webhook handler BEFORE listen
      app.use(bot.webhookCallback(hookPath));

      app.listen(PORT, async () => {
        logger.info(`Server listening on :${PORT}`);

        try {
          await bot.telegram.setWebhook(hookUrl, { drop_pending_updates: true });
          logger.info(`Webhook set → ${hookUrl}`);
        } catch (e) {
          logger.error(`Failed to set webhook: ${e.message}`);
        }

        try {
          const info = await bot.telegram.getMe();
          logger.info(`✅ @${info.username} running — WEBHOOK mode`);

          if (superAdminId) {
            await bot.telegram.sendMessage(superAdminId,
              `🚀 *Bot Started (Railway)*\n\n` +
              `Mode: Webhook\nDomain: \`${domain}\`\n` +
              `⏰ ${new Date().toLocaleString('id-ID')}`,
              { parse_mode: 'Markdown' }
            ).catch(() => {});
          }
        } catch (e) {
          logger.warn(`getMe failed: ${e.message}`);
        }
      });

    } else {
      // ── POLLING MODE (local dev) ─────────────────────────
      try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch (_) {}

      app.listen(PORT, () => logger.info(`Server listening on :${PORT}`));

      await bot.launch();
      const info = await bot.telegram.getMe();
      logger.info(`✅ @${info.username} running — POLLING mode`);

      if (superAdminId) {
        await bot.telegram.sendMessage(superAdminId,
          `🚀 *Bot Started (Dev)*\nMode: Polling\n⏰ ${new Date().toLocaleString('id-ID')}`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}\n${err.stack}`);
    process.exit(1);
  }
};

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
const shutdown = (sig) => {
  logger.info(`${sig} — shutting down gracefully`);
  bot.stop(sig);
  process.exit(0);
};
process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (r) => logger.error(`UnhandledRejection: ${r}`));
process.on('uncaughtException',  (e) => {
  logger.error(`UncaughtException: ${e.message}\n${e.stack}`);
  process.exit(1);
});

startBot();
