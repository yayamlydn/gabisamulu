// src/bot/index.js
// Main Bot Setup, Commands & Action Router

require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const logger = require('../utils/logger');
const { registerUser, checkBan, checkMaintenance } = require('../middleware/auth');
const { AdminDB, SettingsDB } = require('../database/queries');
const Keyboards = require('../utils/keyboards');

// Import handlers
const handlers = require('./handlers');
const adminHandlers = require('./admin');

// =============================================
// BOT INITIALIZATION
// =============================================
const createBot = () => {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  // =============================================
  // GLOBAL MIDDLEWARE
  // =============================================
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    if (ctx.from) {
      logger.debug(`${ctx.from.id} | ${ctx.updateType} | ${ms}ms`);
    }
  });

  bot.use(registerUser);
  bot.use(checkMaintenance);
  bot.use(checkBan);

  // =============================================
  // COMMANDS
  // =============================================
  bot.command('start', handlers.handleStart);
  
  bot.command('admin', async (ctx) => {
    if (!AdminDB.isAdmin(ctx.from.id)) return;
    await adminHandlers.handleAdminPanel(ctx);
  });

  bot.command('stats', async (ctx) => {
    if (!AdminDB.isAdmin(ctx.from.id)) return;
    const { StatsDB } = require('../database/queries');
    const { formatCurrency } = require('../utils/helpers');
    const stats = StatsDB.getSummary();
    await ctx.reply(
      `📊 *Statistik Cepat*\n\n👥 Users: ${stats.totalUsers}\n📦 Orders: ${stats.totalOrders}\n💰 Revenue: ${formatCurrency(stats.totalRevenue)}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('addadmin', async (ctx) => {
    if (!AdminDB.isSuperAdmin(ctx.from.id)) return ctx.reply('⛔ Hanya Super Admin.');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Penggunaan: /addadmin <telegram_id>');
    const targetId = args[1];
    AdminDB.add(targetId, null, null, 'admin', ctx.from.id.toString());
    await ctx.reply(`✅ Admin \`${targetId}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });

  bot.command('removeadmin', async (ctx) => {
    if (!AdminDB.isSuperAdmin(ctx.from.id)) return ctx.reply('⛔ Hanya Super Admin.');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Penggunaan: /removeadmin <telegram_id>');
    AdminDB.remove(args[1]);
    await ctx.reply(`✅ Admin \`${args[1]}\` berhasil dihapus.`, { parse_mode: 'Markdown' });
  });

  bot.command('ban', async (ctx) => {
    if (!AdminDB.isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Penggunaan: /ban <telegram_id>');
    const { UserDB } = require('../database/queries');
    UserDB.ban(args[1]);
    await ctx.reply(`✅ User \`${args[1]}\` diblokir.`, { parse_mode: 'Markdown' });
  });

  bot.command('topup', async (ctx) => {
    if (!AdminDB.isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Penggunaan: /topup <telegram_id> <amount>');
    const { UserDB } = require('../database/queries');
    const { formatCurrency } = require('../utils/helpers');
    const amount = parseFloat(args[2]);
    UserDB.updateBalance(args[1], amount);
    await ctx.reply(`✅ Saldo ${formatCurrency(amount)} berhasil ditambahkan ke user \`${args[1]}\`.`, { parse_mode: 'Markdown' });
  });

  // =============================================
  // CALLBACK QUERIES (Inline Keyboard Actions)
  // =============================================

  // Main menu navigation
  bot.action('menu_main', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleStart(ctx);
  });

  bot.action('menu_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleProfile(ctx);
  });

  bot.action('menu_deposit', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleDeposit(ctx);
  });

  bot.action('menu_order', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleOrder(ctx);
  });

  bot.action('menu_history', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleHistory(ctx);
  });

  bot.action('menu_ticket', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleTicketMenu(ctx);
  });

  bot.action('menu_help', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleHelp(ctx);
  });

  bot.action('menu_admin', async (ctx) => {
    await ctx.answerCbQuery();
    if (!AdminDB.isAdmin(ctx.from.id)) return;
    await adminHandlers.handleAdminPanel(ctx);
  });

  // Deposit amounts
  const depositAmounts = [10000, 25000, 50000, 100000, 250000, 500000];
  depositAmounts.forEach(amount => {
    bot.action(`deposit_${amount}`, async (ctx) => {
      await handlers.handleDepositAmount(ctx, amount);
    });
  });

  bot.action('deposit_custom', async (ctx) => {
    await ctx.answerCbQuery();
    const { getDb } = require('../database/schema');
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      `session_deposit_${ctx.from.id}`, 'waiting_amount'
    );
    await ctx.editMessageText(
      '💰 Masukkan nominal deposit (dalam Rupiah):\n\nContoh: 75000',
      Keyboards.back('menu_deposit')
    );
  });

  // Check payment status
  bot.action(/^check_payment_(.+)$/, async (ctx) => {
    const transactionId = ctx.match[1];
    try { await ctx.answerCbQuery('⏳ Mengecek status pembayaran...'); } catch (e) {}

    const { TransactionDB } = require('../database/queries');
    const { formatCurrency, formatDate } = require('../utils/helpers');

    const tx = TransactionDB.findById(transactionId);
    if (!tx || tx.user_id !== ctx.from.id.toString()) {
      return ctx.answerCbQuery('❌ Transaksi tidak ditemukan.', { show_alert: true });
    }

    const statusLabel = {
      pending:   '🟡 Menunggu Pembayaran',
      completed: '✅ Pembayaran Berhasil',
      failed:    '❌ Pembayaran Gagal',
      expired:   '⏰ Kadaluarsa'
    }[tx.status] || tx.status;

    const text =
      `💳 *Status Pembayaran*\n\n` +
      `📄 ID: \`${tx.transaction_id}\`\n` +
      `💰 Nominal: *${formatCurrency(tx.amount)}*\n` +
      `📊 Status: ${statusLabel}\n` +
      `📅 Dibuat: ${formatDate(tx.created_at)}` +
      (tx.status === 'pending' && tx.mayar_payment_url
        ? `\n\n🔗 [Klik untuk membayar](${tx.mayar_payment_url})`
        : '');

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          ...(tx.status === 'pending' && tx.mayar_payment_url
            ? [[{ text: '💳 Bayar Sekarang', url: tx.mayar_payment_url }]]
            : []),
          [{ text: '🔄 Refresh', callback_data: `check_payment_${transactionId}` }],
          [{ text: '🔙 Kembali', callback_data: 'menu_deposit' }]
        ]
      }
    });
  });

  // Order actions
  bot.action('start_order', handlers.handleStartOrder);
  bot.action('menu_order', async (ctx) => {
    await ctx.answerCbQuery();
    await handlers.handleOrder(ctx);
  });

  // Dynamic order actions
  bot.action(/^cancel_order_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery('Membatalkan order...');
    const { cancelVerification } = require('../services/verification');
    const { OrderDB, UserDB } = require('../database/queries');
    const { formatCurrency } = require('../utils/helpers');
    
    const order = OrderDB.findById(orderId);
    if (!order || order.user_id !== ctx.from.id.toString()) return;
    
    await cancelVerification(orderId);
    if (order.status === 'pending' || order.status === 'processing') {
      UserDB.updateBalance(ctx.from.id.toString(), order.price);
    }
    
    await ctx.editMessageText(
      `❌ Order \`${orderId}\` dibatalkan. Saldo ${formatCurrency(order.price)} dikembalikan.`,
      { parse_mode: 'Markdown', ...Keyboards.back() }
    );
  });

  bot.action(/^refresh_order_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const { OrderDB } = require('../database/queries');
    const { formatCurrency, formatDate, statusBadge } = require('../utils/helpers');
    const order = OrderDB.findById(orderId);
    if (!order) return ctx.answerCbQuery('Order tidak ditemukan');
    
    await ctx.answerCbQuery(`Status: ${order.status}`);
    
    let text = `📦 *Detail Order*\n\nID: \`${orderId}\`\nStatus: ${statusBadge(order.status)} ${order.status}`;
    if (order.verification_code) {
      text += `\n🔐 Kode: \`${order.verification_code}\``;
    }
    text += `\n📅 Dibuat: ${formatDate(order.created_at)}`;
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Keyboards.orderStatus(orderId)
    });
  });

  // Ticket actions
  bot.action('ticket_new', handlers.handleNewTicket);
  bot.action('ticket_list', handlers.handleTicketList);

  // Check membership
  bot.action('check_membership', async (ctx) => {
    try {
      const channelId = process.env.REQUIRED_CHANNEL_ID;
      if (!channelId) { await ctx.answerCbQuery('✅ OK'); return; }
      const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
      const validStatuses = ['member', 'administrator', 'creator'];
      if (validStatuses.includes(member.status)) {
        const { UserDB } = require('../database/queries');
        UserDB.update(ctx.from.id.toString(), { joined_channel: 1 });
        await ctx.answerCbQuery('✅ Bergabung berhasil!');
        await handlers.handleStart(ctx);
      } else {
        await ctx.answerCbQuery('❌ Kamu belum bergabung!', { show_alert: true });
      }
    } catch (err) {
      await ctx.answerCbQuery('✅ OK');
    }
  });

  // =============================================
  // ADMIN CALLBACK ACTIONS
  // =============================================
  bot.action('admin_stats', adminHandlers.handleAdminStats);
  bot.action('admin_orders', adminHandlers.handleAdminOrders);
  bot.action('admin_tickets', adminHandlers.handleAdminTickets);
  bot.action('admin_broadcast', adminHandlers.handleAdminBroadcast);
  bot.action('admin_settings', adminHandlers.handleAdminSettings);
  bot.action('admin_users', (ctx) => adminHandlers.handleAdminUsers(ctx));

  bot.action(/^admin_users_page_(\d+)$/, (ctx) => adminHandlers.handleAdminUsers(ctx, parseInt(ctx.match[1])));
  bot.action(/^admin_view_user_(.+)$/, (ctx) => adminHandlers.handleViewUser(ctx, ctx.match[1]));
  bot.action(/^admin_ban_(.+)$/, (ctx) => adminHandlers.handleBanUser(ctx, ctx.match[1]));
  bot.action(/^admin_unban_(.+)$/, (ctx) => adminHandlers.handleUnbanUser(ctx, ctx.match[1]));
  bot.action(/^admin_topup_(.+)$/, (ctx) => adminHandlers.handleTopUpUser(ctx, ctx.match[1]));
  bot.action(/^admin_view_ticket_(.+)$/, (ctx) => adminHandlers.handleViewTicket(ctx, ctx.match[1]));
  
  bot.action(/^admin_reply_(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    try { await ctx.answerCbQuery(); } catch (e) {}
    const { getDb } = require('../database/schema');
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      `session_admin_reply_${ctx.from.id}`, ticketId
    );
    await ctx.editMessageText(
      `💬 Balas tiket \`${ticketId}\`\n\nKetik pesan balasan Anda:`,
      { parse_mode: 'Markdown', ...Keyboards.back('admin_tickets') }
    );
  });

  bot.action(/^admin_close_ticket_(.+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    try { await ctx.answerCbQuery('Menutup tiket...'); } catch (e) {}
    const { TicketDB } = require('../database/queries');
    TicketDB.close(ticketId);
    await ctx.editMessageText(
      `✅ Tiket \`${ticketId}\` berhasil ditutup.`,
      { parse_mode: 'Markdown', ...Keyboards.back('admin_tickets') }
    );
  });

  // Noop (for display-only buttons)
  bot.action('noop', (ctx) => ctx.answerCbQuery());

  // =============================================
  // TEXT MESSAGE HANDLER
  // =============================================
  bot.on('text', async (ctx) => {
    const { getDb } = require('../database/schema');
    const { UserDB } = require('../database/queries');
    const db = getDb();
    const userId = ctx.from.id.toString();

    // Check admin reply session
    const adminReplySession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_admin_reply_${userId}`);
    if (adminReplySession && AdminDB.isAdmin(ctx.from.id)) {
      const ticketId = adminReplySession.value;
      db.prepare("DELETE FROM settings WHERE key = ?").run(`session_admin_reply_${userId}`);
      
      const { TicketDB } = require('../database/queries');
      TicketDB.addMessage(ticketId, userId, 'admin', ctx.message.text);
      
      const ticket = TicketDB.findById(ticketId);
      if (ticket) {
        try {
          await ctx.telegram.sendMessage(
            ticket.user_id,
            `👮 *Balasan Admin*\n\nTiket: \`${ticketId}\`\nPesan: ${ctx.message.text}`,
            { parse_mode: 'Markdown', ...Keyboards.back('menu_ticket') }
          );
        } catch (e) {}
      }
      
      return ctx.reply('✅ Balasan terkirim!', Keyboards.back('admin_tickets'));
    }

    // Check admin topup session
    const topupSession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_topup_${userId}`);
    if (topupSession && AdminDB.isAdmin(ctx.from.id)) {
      const targetUserId = topupSession.value;
      const amount = parseFloat(ctx.message.text.replace(/[^0-9.]/g, ''));
      db.prepare("DELETE FROM settings WHERE key = ?").run(`session_topup_${userId}`);
      
      if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Nominal tidak valid.');
      
      const { formatCurrency } = require('../utils/helpers');
      UserDB.updateBalance(targetUserId, amount);
      return ctx.reply(
        `✅ Saldo ${formatCurrency(amount)} berhasil ditambahkan ke user \`${targetUserId}\`.`,
        { parse_mode: 'Markdown', ...Keyboards.back('admin_users') }
      );
    }

    // Check broadcast session
    const broadcastSession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_broadcast_${userId}`);
    if (broadcastSession === 'waiting_message' && AdminDB.isAdmin(ctx.from.id)) {
      db.prepare("DELETE FROM settings WHERE key = ?").run(`session_broadcast_${userId}`);
      return adminHandlers.processBroadcast(ctx, ctx.message.text);
    }

    // Check custom deposit amount
    const depositSession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_deposit_${userId}`);
    if (depositSession === 'waiting_amount') {
      db.prepare("DELETE FROM settings WHERE key = ?").run(`session_deposit_${userId}`);
      const amount = parseFloat(ctx.message.text.replace(/[^0-9]/g, ''));
      if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Nominal tidak valid.');
      return handlers.handleDepositAmount(ctx, amount);
    }

    // Handle general text (order, ticket, captcha)
    await handlers.handleTextMessage(ctx, bot);
  });

  // Contact handler (phone verification)
  bot.on('contact', async (ctx) => {
    if (ctx.message.contact.user_id !== ctx.from.id) {
      return ctx.reply('❌ Hanya bisa berbagi nomor Anda sendiri.');
    }
    const phone = ctx.message.contact.phone_number;
    const { UserDB } = require('../database/queries');
    UserDB.update(ctx.from.id.toString(), { phone, is_verified: 1 });
    await ctx.reply(
      `✅ Nomor \`${phone}\` berhasil diverifikasi!`,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
    );
  });

  // Error handler
  bot.catch((err, ctx) => {
    logger.error(`Bot error for ${ctx?.from?.id}: ${err.message}`, { stack: err.stack });
  });

  return bot;
};

module.exports = { createBot };
