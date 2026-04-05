// src/bot/admin.js
// Admin Bot Handlers (in-bot admin panel)

const { UserDB, AdminDB, OrderDB, TransactionDB, TicketDB, StatsDB, SettingsDB } = require('../database/queries');
const Keyboards = require('../utils/keyboards');
const { formatCurrency, formatDate, statusBadge, escapeMarkdown } = require('../utils/helpers');
const logger = require('../utils/logger');
const { getDb } = require('../database/schema');

// =============================================
// ADMIN PANEL HOME
// =============================================
const handleAdminPanel = async (ctx) => {
  const stats = StatsDB.getSummary();

  const text = `
⚙️ *Panel Admin*

📊 *Statistik Hari Ini:*
👥 Total User: ${stats.totalUsers.toLocaleString('id-ID')}
🆕 User Baru: ${stats.newUsersToday.toLocaleString('id-ID')}
📦 Order Selesai: ${stats.ordersToday}
💰 Revenue Hari Ini: ${formatCurrency(stats.revenueToday)}
💸 Total Revenue: ${formatCurrency(stats.totalRevenue)}

Pilih menu admin:
  `;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Keyboards.adminPanel()
  });
};

// =============================================
// STATISTICS
// =============================================
const handleAdminStats = async (ctx) => {
  await ctx.answerCbQuery();
  const stats = StatsDB.getSummary();
  const weekly = StatsDB.getWeekly();

  let weeklyText = '';
  weekly.forEach(day => {
    weeklyText += `📅 ${day.date}: ${day.orders || 0} order | ${formatCurrency(day.revenue || 0)}\n`;
  });

  const text = `
📊 *Statistik Bot*

👥 *User:*
• Total: ${stats.totalUsers.toLocaleString('id-ID')}
• Baru Hari Ini: ${stats.newUsersToday}

📦 *Order:*
• Total Selesai: ${stats.totalOrders}
• Hari Ini: ${stats.ordersToday}

💰 *Revenue:*
• Total: ${formatCurrency(stats.totalRevenue)}
• Hari Ini: ${formatCurrency(stats.revenueToday)}

📅 *7 Hari Terakhir:*
${weeklyText || 'Belum ada data'}
  `;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Keyboards.back('menu_admin')
  });
};

// =============================================
// USER MANAGEMENT
// =============================================
const handleAdminUsers = async (ctx, page = 1) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const limit = 10;
  const offset = (page - 1) * limit;
  const users = UserDB.getAll(limit, offset);
  const total = UserDB.count();
  const totalPages = Math.ceil(total / limit);

  let text = `👥 *Manajemen User* (${total} total)\n\n`;
  users.forEach((u, i) => {
    const num = offset + i + 1;
    text += `${num}. ${u.is_banned ? '🚫' : '✅'} ${escapeMarkdown(u.first_name || 'No Name')}`;
    text += u.username ? ` @${escapeMarkdown(u.username)}` : '';
    text += `\n   ID: \`${u.telegram_id}\` | Saldo: ${formatCurrency(u.balance || 0)}\n`;
  });

  const buttons = users.map(u => [
    { text: `${u.first_name || u.telegram_id}`, callback_data: `admin_view_user_${u.telegram_id}` }
  ]);
  
  const nav = [];
  if (page > 1) nav.push({ text: '◀️ Prev', callback_data: `admin_users_page_${page - 1}` });
  if (page < totalPages) nav.push({ text: 'Next ▶️', callback_data: `admin_users_page_${page + 1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '🔙 Kembali', callback_data: 'menu_admin' }]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
};

// VIEW SINGLE USER
const handleViewUser = async (ctx, userId) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const user = UserDB.findById(userId);
  if (!user) return ctx.editMessageText('❌ User tidak ditemukan.', Keyboards.back('admin_users'));

  const text = `
👤 *Detail User*

🆔 ID: \`${user.telegram_id}\`
👤 Nama: ${escapeMarkdown(user.first_name || '-')} ${escapeMarkdown(user.last_name || '')}
📱 Username: @${user.username || '-'}
📞 Telepon: ${user.phone || '-'}

💰 Saldo: ${formatCurrency(user.balance || 0)}
📦 Total Order: ${user.total_orders || 0}
🚫 Status Ban: ${user.is_banned ? 'BANNED' : 'Aktif'}
✅ Captcha: ${user.captcha_passed ? 'Passed' : 'Belum'}

📅 Bergabung: ${formatDate(user.created_at)}
🕐 Aktif Terakhir: ${formatDate(user.last_active)}
  `;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Keyboards.userActions(userId)
  });
};

// =============================================
// ORDER MANAGEMENT
// =============================================
const handleAdminOrders = async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.*, u.username, u.first_name 
    FROM orders o 
    LEFT JOIN users u ON o.user_id = u.telegram_id 
    ORDER BY o.created_at DESC LIMIT 20
  `).all();

  let text = `📦 *Order Terbaru*\n\n`;
  if (!orders.length) {
    text += 'Belum ada order.';
  } else {
    orders.forEach((o, i) => {
      text += `${i + 1}. ${statusBadge(o.status)} \`${o.order_id}\`\n`;
      text += `   👤 ${o.first_name || o.user_id} | 💰 ${formatCurrency(o.price)}\n`;
      text += `   📅 ${formatDate(o.created_at)}\n\n`;
    });
  }

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Keyboards.back('menu_admin')
  });
};

// =============================================
// TICKETS MANAGEMENT
// =============================================
const handleAdminTickets = async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const tickets = TicketDB.getOpen();
  let text = `🎫 *Tiket Masuk* (${tickets.length} open)\n\n`;

  if (!tickets.length) {
    text += 'Tidak ada tiket yang perlu direspons.';
  }

  const buttons = tickets.map(t => ([{
    text: `${statusBadge(t.status)} ${t.ticket_id} - ${t.first_name || t.user_id}`,
    callback_data: `admin_view_ticket_${t.ticket_id}`
  }]));
  buttons.push([{ text: '🔙 Kembali', callback_data: 'menu_admin' }]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
};

// VIEW TICKET
const handleViewTicket = async (ctx, ticketId) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const ticket = TicketDB.findById(ticketId);
  const messages = TicketDB.getMessages(ticketId);

  if (!ticket) return ctx.editMessageText('❌ Tiket tidak ditemukan.');

  let text = `🎫 *Tiket ${ticket.ticket_id}*\n`;
  text += `📝 Subjek: ${escapeMarkdown(ticket.subject)}\n`;
  text += `📊 Status: ${ticket.status}\n\n`;
  text += `*Percakapan:*\n`;

  messages.slice(-5).forEach(m => {
    const sender = m.sender_type === 'admin' ? '👮 Admin' : '👤 User';
    text += `\n${sender}: ${escapeMarkdown(m.content)}\n`;
    text += `   _${formatDate(m.created_at)}_\n`;
  });

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Keyboards.ticketActions(ticketId)
  });
};

// =============================================
// BROADCAST
// =============================================
const handleAdminBroadcast = async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) {}

  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    `session_broadcast_${ctx.from.id}`, 'waiting_message'
  );

  await ctx.editMessageText(
    '📢 *Broadcast Pesan*\n\nKetik pesan yang ingin dikirim ke semua user:\n\n_Mendukung format Markdown_',
    { parse_mode: 'Markdown', ...Keyboards.back('menu_admin') }
  );
};

const processBroadcast = async (ctx, message) => {
  const users = UserDB.getAll(9999, 0);
  const adminId = ctx.from.id.toString();

  await ctx.reply(`📢 Mengirim broadcast ke ${users.length} user...`);

  let success = 0;
  let fail = 0;

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.telegram_id, `📢 *Pengumuman*\n\n${message}`, { parse_mode: 'Markdown' });
      success++;
    } catch (err) {
      fail++;
    }
    // Small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 50));
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO broadcast_logs (admin_id, message, target_count, success_count, fail_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(adminId, message, users.length, success, fail);

  await ctx.reply(
    `✅ *Broadcast Selesai*\n\n✅ Berhasil: ${success}\n❌ Gagal: ${fail}`,
    { parse_mode: 'Markdown', ...Keyboards.back('menu_admin') }
  );
};

// =============================================
// SETTINGS
// =============================================
const handleAdminSettings = async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  
  const settings = [
    { key: 'order_price', label: 'Harga Order' },
    { key: 'min_deposit', label: 'Min Deposit' },
    { key: 'maintenance_mode', label: 'Maintenance' },
    { key: 'bot_name', label: 'Nama Bot' }
  ];

  let text = '⚙️ *Pengaturan Bot*\n\n';
  settings.forEach(s => {
    const val = SettingsDB.get(s.key) || '-';
    text += `*${s.label}:* ${val}\n`;
  });

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔧 Ubah Harga Order', callback_data: 'settings_order_price' }],
        [{ text: '🔧 Ubah Min Deposit', callback_data: 'settings_min_deposit' }],
        [{ text: '🔧 Toggle Maintenance', callback_data: 'settings_toggle_maintenance' }],
        [{ text: '🔙 Kembali', callback_data: 'menu_admin' }]
      ]
    }
  });
};

// =============================================
// BAN / UNBAN
// =============================================
const handleBanUser = async (ctx, userId) => {
  try { await ctx.answerCbQuery('Memblokir user...'); } catch (e) {}
  UserDB.ban(userId);
  await ctx.editMessageText(
    `✅ User \`${userId}\` berhasil diblokir.`,
    { parse_mode: 'Markdown', ...Keyboards.userActions(userId) }
  );
};

const handleUnbanUser = async (ctx, userId) => {
  try { await ctx.answerCbQuery('Membuka blokir...'); } catch (e) {}
  UserDB.unban(userId);
  await ctx.editMessageText(
    `✅ User \`${userId}\` berhasil dibuka blokirnya.`,
    { parse_mode: 'Markdown', ...Keyboards.userActions(userId) }
  );
};

// TOP UP USER BALANCE
const handleTopUpUser = async (ctx, userId) => {
  try { await ctx.answerCbQuery(); } catch (e) {}
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    `session_topup_${ctx.from.id}`, userId
  );
  await ctx.editMessageText(
    `💰 Top Up Saldo User \`${userId}\`\n\nKetik nominal yang ingin ditambahkan:`,
    { parse_mode: 'Markdown', ...Keyboards.back('admin_users') }
  );
};

module.exports = {
  handleAdminPanel,
  handleAdminStats,
  handleAdminUsers,
  handleViewUser,
  handleAdminOrders,
  handleAdminTickets,
  handleViewTicket,
  handleAdminBroadcast,
  processBroadcast,
  handleAdminSettings,
  handleBanUser,
  handleUnbanUser,
  handleTopUpUser
};
