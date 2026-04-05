// src/middleware/auth.js
// Authentication & Authorization Middleware

const { UserDB, AdminDB, SettingsDB } = require('../database/queries');
const { generateCaptcha } = require('../utils/helpers');
const Keyboards = require('../utils/keyboards');
const logger = require('../utils/logger');

// Register user middleware - auto create user if not exists
const registerUser = async (ctx, next) => {
  if (!ctx.from) return next();
  
  try {
    const existing = UserDB.findById(ctx.from.id.toString());
    if (!existing) {
      UserDB.create({
        telegram_id: ctx.from.id.toString(),
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });
      logger.info(`New user registered: ${ctx.from.id} (@${ctx.from.username})`);
    } else {
      // Update last active
      UserDB.update(ctx.from.id.toString(), { last_active: new Date().toISOString() });
    }
    
    ctx.user = UserDB.findById(ctx.from.id.toString());
  } catch (err) {
    logger.error(`registerUser middleware error: ${err.message}`);
  }
  
  return next();
};

// Check if user is banned
const checkBan = async (ctx, next) => {
  if (!ctx.user) return next();
  
  if (ctx.user.is_banned) {
    return ctx.reply(
      '🚫 *Akun Anda telah diblokir*\n\nHubungi admin jika ini adalah kesalahan.',
      { parse_mode: 'Markdown' }
    );
  }
  
  return next();
};

// Maintenance mode check
const checkMaintenance = async (ctx, next) => {
  const maintenance = SettingsDB.get('maintenance_mode');
  if (maintenance === 'true' && !AdminDB.isAdmin(ctx.from?.id)) {
    return ctx.reply(
      '🔧 *Bot sedang dalam maintenance*\n\nSilahkan coba lagi nanti.',
      { parse_mode: 'Markdown' }
    );
  }
  return next();
};

// Require captcha verification
const requireCaptcha = async (ctx, next) => {
  if (!ctx.user) return next();
  if (ctx.user.captcha_passed) return next();
  
  const { getDb } = require('../database/schema');
  const db = getDb();
  
  // Check existing captcha session
  const session = db.prepare(`
    SELECT * FROM captcha_sessions 
    WHERE user_id = ? AND passed = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(ctx.from.id.toString());
  
  if (!session) {
    const captcha = generateCaptcha();
    const expiresAt = new Date(Date.now() + 5 * 60000).toISOString();
    db.prepare('INSERT INTO captcha_sessions (user_id, question, answer, expires_at) VALUES (?, ?, ?, ?)')
      .run(ctx.from.id.toString(), captcha.question, captcha.answer, expiresAt);
    
    await ctx.reply(
      `🤖 *Verifikasi Keamanan*\n\nUntuk melanjutkan, jawab pertanyaan berikut:\n\n❓ ${captcha.question}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  return next();
};

// Require channel/group membership
const requireMembership = async (ctx, next) => {
  if (!ctx.user || ctx.user.joined_channel) return next();
  
  try {
    const channelId = process.env.REQUIRED_CHANNEL_ID;
    if (!channelId) return next();
    
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    const validStatuses = ['member', 'administrator', 'creator'];
    
    if (!validStatuses.includes(member.status)) {
      return ctx.reply(
        `📢 *Bergabung Channel Dulu!*\n\nUntuk menggunakan bot ini, kamu harus bergabung di channel kami:\n\n👉 ${process.env.REQUIRED_CHANNEL_USERNAME}\n\nSetelah bergabung, tekan tombol di bawah ini.`,
        {
          parse_mode: 'Markdown',
          ...require('../utils/keyboards').Keyboards?.confirm('check_membership', 'menu_main') ||
          require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.url('📢 Join Channel', `https://t.me/${process.env.REQUIRED_CHANNEL_USERNAME?.replace('@', '')}`)],
            [require('telegraf').Markup.button.callback('✅ Sudah Join', 'check_membership')]
          ])
        }
      );
    }
    
    UserDB.update(ctx.from.id.toString(), { joined_channel: 1 });
  } catch (err) {
    logger.error(`requireMembership error: ${err.message}`);
  }
  
  return next();
};

// Require admin
const requireAdmin = async (ctx, next) => {
  if (!ctx.from) return;
  if (AdminDB.isAdmin(ctx.from.id)) return next();
  
  return ctx.reply('⛔ Akses ditolak. Hanya untuk admin.');
};

// Require super admin
const requireSuperAdmin = async (ctx, next) => {
  if (!ctx.from) return;
  if (AdminDB.isSuperAdmin(ctx.from.id)) return next();
  
  return ctx.reply('⛔ Akses ditolak. Hanya untuk Super Admin.');
};

module.exports = {
  registerUser,
  checkBan,
  checkMaintenance,
  requireCaptcha,
  requireMembership,
  requireAdmin,
  requireSuperAdmin
};
