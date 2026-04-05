// src/bot/handlers.js
// Main Bot Command & Action Handlers

const { Markup } = require('telegraf');
const { UserDB, AdminDB, OrderDB, TransactionDB, TicketDB, SettingsDB, StatsDB } = require('../database/queries');
const { createInvoice } = require('../services/payment');
const { submitVerification, fetchVerificationCode, cancelVerification } = require('../services/verification');
const Keyboards = require('../utils/keyboards');
const { formatCurrency, formatDate, statusBadge, generateCaptcha, escapeMarkdown } = require('../utils/helpers');
const logger = require('../utils/logger');
const { getDb } = require('../database/schema');

// =============================================
// /start COMMAND
// =============================================
const handleStart = async (ctx) => {
  const user = ctx.user;
  const botName = SettingsDB.get('bot_name') || 'Business Verification Bot';
  const isAdmin = AdminDB.isAdmin(ctx.from.id);

  const welcomeText = `
🎉 *Selamat Datang di ${escapeMarkdown(botName)}!*

Halo, *${escapeMarkdown(ctx.from.first_name)}*! 👋

Kami adalah platform verifikasi bisnis terpercaya yang membantu Anda dalam proses autentikasi dan verifikasi pelanggan.

💼 *Layanan Kami:*
• ✅ Verifikasi Bisnis & Pelanggan
• 💰 Sistem Saldo & Deposit
• 🎫 Support 24/7 via Tiket
• 📊 Riwayat Transaksi Lengkap

💰 *Saldo Anda:* ${formatCurrency(user?.balance || 0)}

Pilih menu di bawah ini untuk memulai:
  `;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    ...Keyboards.mainMenu(isAdmin)
  });
};

// =============================================
// MENU: PROFILE
// =============================================
const handleProfile = async (ctx) => {
  const user = ctx.user;
  if (!user) return;

  const text = `
👤 *Profil Saya*

🆔 ID: \`${user.telegram_id}\`
👤 Nama: ${escapeMarkdown(user.first_name || '-')} ${escapeMarkdown(user.last_name || '')}
📱 Username: @${escapeMarkdown(user.username || 'Tidak ada')}
📞 Telepon: ${user.phone || 'Belum terdaftar'}

💰 *Saldo:* ${formatCurrency(user.balance || 0)}
📦 *Total Order:* ${user.total_orders || 0}
💸 *Total Belanja:* ${formatCurrency(user.total_spent || 0)}

🔐 *Status Akun:*
${user.captcha_passed ? '✅' : '❌'} Verifikasi CAPTCHA
${user.joined_channel ? '✅' : '❌'} Bergabung Channel
${user.is_banned ? '🚫 Akun Diblokir' : '✅ Akun Aktif'}

🎫 *Kode Referral:* \`${user.referral_code || 'N/A'}\`
📅 *Bergabung:* ${formatDate(user.created_at)}
  `;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Keyboards.back()
  });
};

// =============================================
// MENU: DEPOSIT
// =============================================
const handleDeposit = async (ctx) => {
  await ctx.reply(
    '💰 *Deposit Saldo*\n\nPilih nominal deposit atau masukkan nominal sendiri:',
    { parse_mode: 'Markdown', ...Keyboards.depositAmounts() }
  );
};

// PROCESS DEPOSIT AMOUNT
const handleDepositAmount = async (ctx, amount) => {
  const minDeposit = parseInt(SettingsDB.get('min_deposit')) || 5000;
  const maxDeposit = parseInt(SettingsDB.get('max_deposit')) || 10000000;

  if (amount < minDeposit) {
    return ctx.answerCbQuery(`❌ Minimal deposit ${formatCurrency(minDeposit)}`);
  }
  if (amount > maxDeposit) {
    return ctx.answerCbQuery(`❌ Maksimal deposit ${formatCurrency(maxDeposit)}`);
  }

  await ctx.answerCbQuery('⏳ Membuat link pembayaran...');

  try {
    const invoice = await createInvoice(ctx.from.id.toString(), amount, 'Deposit Saldo');

    const text = `
💳 *Invoice Pembayaran*

📄 ID Transaksi: \`${invoice.transactionId}\`
💰 Nominal: *${formatCurrency(amount)}*
⏰ Berlaku: 24 jam

Klik tombol di bawah untuk melakukan pembayaran melalui *Mayar.id*:
    `;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Bayar Sekarang', url: invoice.paymentUrl }],
          [{ text: '🔄 Cek Status', callback_data: `check_payment_${invoice.transactionId}` }],
          [{ text: '🔙 Kembali', callback_data: 'menu_deposit' }]
        ]
      }
    });
  } catch (err) {
    logger.error(`handleDepositAmount error: ${err.message}`);
    await ctx.editMessageText('❌ Gagal membuat invoice. Silahkan coba lagi.', Keyboards.back('menu_deposit'));
  }
};

// =============================================
// MENU: ORDER
// =============================================
const handleOrder = async (ctx) => {
  const user = ctx.user;
  const price = parseInt(SettingsDB.get('order_price')) || 10000;

  const text = `
🛒 *Order Verifikasi*

Layanan verifikasi bisnis & autentikasi pelanggan premium.

💰 *Harga:* ${formatCurrency(price)}
⏱️ *Estimasi:* 1-5 menit
🔒 *Jaminan:* Uang kembali jika gagal

💳 *Saldo Anda:* ${formatCurrency(user?.balance || 0)}
${(user?.balance || 0) < price ? '\n⚠️ *Saldo tidak mencukupi!* Silahkan deposit terlebih dahulu.' : ''}

Masukkan *nomor/data target* yang akan diverifikasi, atau klik Mulai Order:
  `;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [(user?.balance || 0) >= price 
          ? { text: '✅ Mulai Order', callback_data: 'start_order' }
          : { text: '💰 Deposit Dulu', callback_data: 'menu_deposit' }
        ],
        [{ text: '🔙 Kembali', callback_data: 'menu_main' }]
      ]
    }
  });
};

// PROCESS ORDER
const handleStartOrder = async (ctx) => {
  const user = ctx.user;
  const price = parseInt(SettingsDB.get('order_price')) || 10000;

  if ((user?.balance || 0) < price) {
    return ctx.answerCbQuery('❌ Saldo tidak mencukupi!', { show_alert: true });
  }

  await ctx.answerCbQuery();
  
  // Store session state
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    `session_order_${ctx.from.id}`, 'waiting_target'
  );

  await ctx.editMessageText(
    '📝 *Masukkan Data Target*\n\nKetik nomor telepon atau data yang akan diverifikasi:\n\n_Contoh: 08xxxxxxxxxx_',
    { parse_mode: 'Markdown', ...Keyboards.back('menu_order') }
  );
};

// =============================================
// MENU: HISTORY
// =============================================
const handleHistory = async (ctx) => {
  const orders = OrderDB.getByUser(ctx.from.id.toString(), 5);

  if (!orders.length) {
    return ctx.reply(
      '📋 *Riwayat Order*\n\nBelum ada riwayat order.',
      { parse_mode: 'Markdown', ...Keyboards.back() }
    );
  }

  let text = '📋 *Riwayat Order Terakhir*\n\n';
  orders.forEach((order, i) => {
    text += `${i + 1}. ${statusBadge(order.status)} \`${order.order_id}\`\n`;
    text += `   💰 ${formatCurrency(order.price)} | 📅 ${formatDate(order.created_at)}\n\n`;
  });

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Keyboards.back()
  });
};

// =============================================
// MENU: TICKET
// =============================================
const handleTicketMenu = async (ctx) => {
  await ctx.reply(
    '🎫 *Support Tiket*\n\nBuat tiket baru atau lihat tiket aktif Anda:',
    { parse_mode: 'Markdown', ...Keyboards.ticketMenu() }
  );
};

const handleNewTicket = async (ctx) => {
  await ctx.answerCbQuery();
  
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    `session_ticket_${ctx.from.id}`, 'waiting_subject'
  );

  await ctx.editMessageText(
    '🎫 *Buat Tiket Baru*\n\nKetik *subjek/topik* permasalahan Anda:',
    { parse_mode: 'Markdown', ...Keyboards.back('menu_ticket') }
  );
};

const handleTicketList = async (ctx) => {
  await ctx.answerCbQuery();
  const tickets = TicketDB.getByUser(ctx.from.id.toString());

  if (!tickets.length) {
    return ctx.editMessageText(
      '📋 Belum ada tiket.',
      { ...Keyboards.back('menu_ticket') }
    );
  }

  let text = '🎫 *Tiket Saya*\n\n';
  tickets.forEach(t => {
    text += `${statusBadge(t.status)} \`${t.ticket_id}\`\n`;
    text += `📝 ${escapeMarkdown(t.subject)}\n`;
    text += `📅 ${formatDate(t.created_at)}\n\n`;
  });

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Keyboards.back('menu_ticket')
  });
};

// =============================================
// CAPTCHA HANDLER
// =============================================
const handleCaptchaAnswer = async (ctx) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT * FROM captcha_sessions 
    WHERE user_id = ? AND passed = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(ctx.from.id.toString());

  if (!session) return;

  const answer = ctx.message.text.trim();
  if (answer === session.answer) {
    db.prepare('UPDATE captcha_sessions SET passed = 1 WHERE id = ?').run(session.id);
    UserDB.update(ctx.from.id.toString(), { captcha_passed: 1 });
    
    await ctx.reply('✅ *Verifikasi berhasil!* Selamat datang!', { parse_mode: 'Markdown' });
    
    // Show main menu
    const isAdmin = AdminDB.isAdmin(ctx.from.id);
    await ctx.reply(
      '🏠 Pilih menu di bawah:',
      { ...Keyboards.mainMenu(isAdmin) }
    );
  } else {
    db.prepare('UPDATE captcha_sessions SET attempts = attempts + 1 WHERE id = ?').run(session.id);
    await ctx.reply('❌ Jawaban salah. Coba lagi!');
  }
};

// =============================================
// TEXT MESSAGE HANDLER (Handle session states)
// =============================================
const handleTextMessage = async (ctx, bot) => {
  const db = getDb();
  const userId = ctx.from.id.toString();
  
  // Check captcha first
  const captchaSession = db.prepare(`
    SELECT * FROM captcha_sessions 
    WHERE user_id = ? AND passed = 0 AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);

  if (captchaSession && !ctx.user?.captcha_passed) {
    return handleCaptchaAnswer(ctx);
  }

  // Check session states
  const orderSession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_order_${userId}`);
  const ticketSession = db.prepare("SELECT value FROM settings WHERE key = ?").get(`session_ticket_${userId}`);

  if (orderSession?.value === 'waiting_target') {
    db.prepare("DELETE FROM settings WHERE key = ?").run(`session_order_${userId}`);
    return handleCreateOrder(ctx, ctx.message.text);
  }

  if (ticketSession?.value === 'waiting_subject') {
    db.prepare("DELETE FROM settings WHERE key = ?").run(`session_ticket_${userId}`);
    return handleCreateTicket(ctx, ctx.message.text);
  }

  if (ticketSession?.value?.startsWith('waiting_message_')) {
    const ticketId = ticketSession.value.replace('waiting_message_', '');
    db.prepare("DELETE FROM settings WHERE key = ?").run(`session_ticket_${userId}`);
    return handleTicketMessage(ctx, ticketId, ctx.message.text);
  }
};

// =============================================
// CREATE ORDER HANDLER
// =============================================
const handleCreateOrder = async (ctx, targetData) => {
  const user = ctx.user;
  const price = parseInt(SettingsDB.get('order_price')) || 10000;

  if ((user?.balance || 0) < price) {
    return ctx.reply('❌ Saldo tidak mencukupi!', Keyboards.back('menu_deposit'));
  }

  // Deduct balance
  UserDB.updateBalance(user.telegram_id, -price);

  // Create order
  const orderId = OrderDB.create({
    user_id: user.telegram_id,
    target_data: targetData,
    price: price,
    service_type: 'verification'
  });

  const text = `
✅ *Order Berhasil Dibuat!*

📦 ID Order: \`${orderId}\`
🎯 Target: \`${escapeMarkdown(targetData)}\`
💰 Harga: ${formatCurrency(price)}
⏱️ Status: 🟡 Menunggu Proses

Bot akan mengambil kode verifikasi secara otomatis dalam beberapa menit.
⏰ Batas waktu: ${parseInt(process.env.VERIFICATION_EXPIRE_MINUTES) || 30} menit
  `;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Keyboards.orderStatus(orderId)
  });

  // Submit to verification API
  try {
    await submitVerification(orderId, targetData);
    
    // Auto-fetch after delay (simulate)
    setTimeout(async () => {
      const code = await fetchVerificationCode(orderId);
      if (code) {
        try {
          await ctx.telegram.sendMessage(
            user.telegram_id,
            `🎉 *Kode Verifikasi Berhasil!*\n\n📦 Order: \`${orderId}\`\n🔐 Kode: \`${code}\`\n\n⚡ Segera gunakan kode ini sebelum kadaluarsa!`,
            { parse_mode: 'Markdown', ...Keyboards.back() }
          );
        } catch (notifyErr) {
          logger.warn(`Could not notify user: ${notifyErr.message}`);
        }
      }
    }, 10000); // 10 seconds delay for demo
  } catch (err) {
    logger.error(`submitVerification error: ${err.message}`);
  }
};

// =============================================
// CREATE TICKET
// =============================================
const handleCreateTicket = async (ctx, subject) => {
  const ticketId = TicketDB.create(ctx.from.id.toString(), subject);
  
  await ctx.reply(
    `🎫 *Tiket Berhasil Dibuat!*\n\nID: \`${ticketId}\`\n📝 Subjek: ${escapeMarkdown(subject)}\n\nSekarang kirim pesan pertama Anda:`,
    { parse_mode: 'Markdown' }
  );

  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    `session_ticket_${ctx.from.id}`, `waiting_message_${ticketId}`
  );
};

const handleTicketMessage = async (ctx, ticketId, content) => {
  TicketDB.addMessage(ticketId, ctx.from.id.toString(), 'user', content);
  
  await ctx.reply(
    `✅ Pesan terkirim!\n\nTim support kami akan segera merespons.`,
    Keyboards.back('menu_ticket')
  );

  // Notify all admins
  const admins = AdminDB.getAll();
  const ticket = TicketDB.findById(ticketId);
  for (const admin of admins) {
    try {
      await ctx.telegram.sendMessage(
        admin.telegram_id,
        `🎫 *Pesan Tiket Baru*\n\nID: \`${ticketId}\`\nUser: ${ctx.from.first_name} (@${ctx.from.username})\nPesan: ${escapeMarkdown(content)}`,
        {
          parse_mode: 'Markdown',
          ...Keyboards.ticketActions(ticketId)
        }
      );
    } catch (err) { /* silent */ }
  }
};

// =============================================
// HELP MENU
// =============================================
const handleHelp = async (ctx) => {
  const text = `
ℹ️ *Cara Menggunakan Bot*

1️⃣ *Deposit Saldo*
   Klik menu "Deposit Saldo" dan pilih nominal yang diinginkan. Pembayaran melalui Mayar.id.

2️⃣ *Order Verifikasi*
   Klik "Order Sekarang", masukkan nomor/data target, lalu konfirmasi. Kode akan dikirim otomatis.

3️⃣ *Tiket Support*
   Jika ada masalah, buat tiket support dan tim kami akan merespons.

4️⃣ *Riwayat Order*
   Lihat semua order dan status verifikasi Anda.

📞 *Butuh Bantuan?*
   Buat tiket support atau hubungi admin.
  `;

  await ctx.reply(text, { parse_mode: 'Markdown', ...Keyboards.back() });
};

module.exports = {
  handleStart,
  handleProfile,
  handleDeposit,
  handleDepositAmount,
  handleOrder,
  handleStartOrder,
  handleHistory,
  handleTicketMenu,
  handleNewTicket,
  handleTicketList,
  handleTextMessage,
  handleCreateOrder,
  handleCreateTicket,
  handleTicketMessage,
  handleHelp
};
