// src/utils/keyboards.js
// Telegram Inline Keyboard Builders

const { Markup } = require('telegraf');

const Keyboards = {
  // Main menu keyboard
  mainMenu: (isAdmin = false) => {
    const buttons = [
      [
        Markup.button.callback('🛒 Order Sekarang', 'menu_order'),
        Markup.button.callback('👤 Profil Saya', 'menu_profile')
      ],
      [
        Markup.button.callback('💰 Deposit Saldo', 'menu_deposit'),
        Markup.button.callback('📋 Riwayat Order', 'menu_history')
      ],
      [
        Markup.button.callback('🎫 Tiket Support', 'menu_ticket'),
        Markup.button.callback('ℹ️ Cara Pakai', 'menu_help')
      ]
    ];
    
    if (isAdmin) {
      buttons.push([Markup.button.callback('⚙️ Panel Admin', 'menu_admin')]);
    }
    
    return Markup.inlineKeyboard(buttons);
  },

  // Admin panel keyboard
  adminPanel: () => Markup.inlineKeyboard([
    [
      Markup.button.callback('👥 Manajemen User', 'admin_users'),
      Markup.button.callback('📊 Statistik', 'admin_stats')
    ],
    [
      Markup.button.callback('📦 Kelola Order', 'admin_orders'),
      Markup.button.callback('💳 Transaksi', 'admin_transactions')
    ],
    [
      Markup.button.callback('🎫 Tiket Masuk', 'admin_tickets'),
      Markup.button.callback('📢 Broadcast', 'admin_broadcast')
    ],
    [
      Markup.button.callback('⚙️ Pengaturan', 'admin_settings'),
      Markup.button.callback('👮 Kelola Admin', 'admin_manage')
    ],
    [Markup.button.callback('🏠 Kembali ke Menu', 'menu_main')]
  ]),

  // Deposit keyboard
  depositAmounts: () => Markup.inlineKeyboard([
    [
      Markup.button.callback('Rp 10.000', 'deposit_10000'),
      Markup.button.callback('Rp 25.000', 'deposit_25000'),
      Markup.button.callback('Rp 50.000', 'deposit_50000')
    ],
    [
      Markup.button.callback('Rp 100.000', 'deposit_100000'),
      Markup.button.callback('Rp 250.000', 'deposit_250000'),
      Markup.button.callback('Rp 500.000', 'deposit_500000')
    ],
    [Markup.button.callback('💬 Nominal Lain', 'deposit_custom')],
    [Markup.button.callback('🔙 Kembali', 'menu_main')]
  ]),

  // Order confirm keyboard
  orderConfirm: (orderId) => Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Konfirmasi Order', `confirm_order_${orderId}`),
      Markup.button.callback('❌ Batalkan', `cancel_order_${orderId}`)
    ]
  ]),

  // Order status keyboard
  orderStatus: (orderId) => Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh Status', `refresh_order_${orderId}`)],
    [Markup.button.callback('❌ Batalkan Order', `cancel_order_${orderId}`)],
    [Markup.button.callback('🏠 Menu Utama', 'menu_main')]
  ]),

  // Ticket keyboard
  ticketMenu: () => Markup.inlineKeyboard([
    [Markup.button.callback('📝 Buat Tiket Baru', 'ticket_new')],
    [Markup.button.callback('📋 Tiket Saya', 'ticket_list')],
    [Markup.button.callback('🔙 Kembali', 'menu_main')]
  ]),

  // Back button
  back: (action = 'menu_main') => Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Kembali', action)]
  ]),

  // Confirm/Cancel generic
  confirm: (confirmAction, cancelAction = 'menu_main') => Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Ya, Lanjutkan', confirmAction),
      Markup.button.callback('❌ Tidak', cancelAction)
    ]
  ]),

  // Pagination keyboard
  pagination: (prefix, currentPage, totalPages) => {
    const buttons = [];
    const row = [];
    if (currentPage > 1) row.push(Markup.button.callback('◀️ Prev', `${prefix}_page_${currentPage - 1}`));
    row.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) row.push(Markup.button.callback('Next ▶️', `${prefix}_page_${currentPage + 1}`));
    buttons.push(row);
    buttons.push([Markup.button.callback('🔙 Kembali', 'menu_main')]);
    return Markup.inlineKeyboard(buttons);
  },

  // User management admin
  userActions: (userId) => Markup.inlineKeyboard([
    [
      Markup.button.callback('🚫 Ban User', `admin_ban_${userId}`),
      Markup.button.callback('✅ Unban', `admin_unban_${userId}`)
    ],
    [Markup.button.callback('💰 Top Up Saldo', `admin_topup_${userId}`)],
    [Markup.button.callback('🔙 Kembali', 'admin_users')]
  ]),

  // Admin ticket response
  ticketActions: (ticketId) => Markup.inlineKeyboard([
    [Markup.button.callback('💬 Balas Tiket', `admin_reply_${ticketId}`)],
    [Markup.button.callback('🔒 Tutup Tiket', `admin_close_ticket_${ticketId}`)],
    [Markup.button.callback('🔙 Kembali', 'admin_tickets')]
  ]),

  // Share contact button
  shareContact: () => Markup.keyboard([
    [Markup.button.contactRequest('📱 Bagikan Nomor Telepon')]
  ]).resize().oneTime(),

  // Remove keyboard
  remove: () => Markup.removeKeyboard()
};

module.exports = Keyboards;
