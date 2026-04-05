// src/database/queries.js
// Database Query Helpers

const { getDb } = require('./schema');
const { v4: uuidv4 } = require('uuid');

// =============================================
// USER QUERIES
// =============================================
const UserDB = {
  findById: (telegramId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  },

  create: (userData) => {
    const db = getDb();
    const referralCode = uuidv4().substring(0, 8).toUpperCase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users 
      (telegram_id, username, first_name, last_name, referral_code)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userData.telegram_id,
      userData.username || null,
      userData.first_name || null,
      userData.last_name || null,
      referralCode
    );
  },

  update: (telegramId, data) => {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), new Date().toISOString(), telegramId];
    return db.prepare(`UPDATE users SET ${fields}, updated_at = ? WHERE telegram_id = ?`).run(...values);
  },

  getAll: (limit = 100, offset = 0) => {
    const db = getDb();
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  },

  count: () => {
    const db = getDb();
    return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  },

  countToday: () => {
    const db = getDb();
    return db.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')").get().count;
  },

  search: (query) => {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM users 
      WHERE telegram_id LIKE ? OR username LIKE ? OR first_name LIKE ?
      LIMIT 20
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
  },

  updateBalance: (telegramId, amount) => {
    const db = getDb();
    return db.prepare('UPDATE users SET balance = balance + ?, updated_at = ? WHERE telegram_id = ?')
      .run(amount, new Date().toISOString(), telegramId);
  },

  ban: (telegramId) => {
    const db = getDb();
    return db.prepare('UPDATE users SET is_banned = 1, updated_at = ? WHERE telegram_id = ?')
      .run(new Date().toISOString(), telegramId);
  },

  unban: (telegramId) => {
    const db = getDb();
    return db.prepare('UPDATE users SET is_banned = 0, updated_at = ? WHERE telegram_id = ?')
      .run(new Date().toISOString(), telegramId);
  }
};

// =============================================
// ADMIN QUERIES
// =============================================
const AdminDB = {
  findById: (telegramId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM admins WHERE telegram_id = ? AND is_active = 1').get(telegramId);
  },

  isSuperAdmin: (telegramId) => {
    return telegramId.toString() === process.env.SUPER_ADMIN_ID;
  },

  isAdmin: (telegramId) => {
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE telegram_id = ? AND is_active = 1').get(telegramId.toString());
    return !!admin || telegramId.toString() === process.env.SUPER_ADMIN_ID;
  },

  add: (telegramId, username, firstName, role, addedBy) => {
    const db = getDb();
    return db.prepare(`
      INSERT OR REPLACE INTO admins (telegram_id, username, first_name, role, added_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(telegramId, username, firstName, role, addedBy);
  },

  remove: (telegramId) => {
    const db = getDb();
    return db.prepare('UPDATE admins SET is_active = 0 WHERE telegram_id = ?').run(telegramId);
  },

  getAll: () => {
    const db = getDb();
    return db.prepare('SELECT * FROM admins WHERE is_active = 1').all();
  }
};

// =============================================
// TRANSACTION QUERIES
// =============================================
const TransactionDB = {
  create: (data) => {
    const db = getDb();
    const txId = `TXN-${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
    db.prepare(`
      INSERT INTO transactions 
      (transaction_id, user_id, type, amount, status, payment_method, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(txId, data.user_id, data.type, data.amount, data.status || 'pending',
      data.payment_method || null, data.description || null,
      JSON.stringify(data.metadata || {}));
    return txId;
  },

  update: (transactionId, data) => {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), new Date().toISOString(), transactionId];
    return db.prepare(`UPDATE transactions SET ${fields}, updated_at = ? WHERE transaction_id = ?`).run(...values);
  },

  findById: (transactionId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM transactions WHERE transaction_id = ?').get(transactionId);
  },

  findByMayarId: (mayarInvoiceId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM transactions WHERE mayar_invoice_id = ?').get(mayarInvoiceId);
  },

  getByUser: (userId, limit = 10) => {
    const db = getDb();
    return db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  },

  getTotalRevenue: () => {
    const db = getDb();
    return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE status = 'completed' AND type = 'deposit'").get().total || 0;
  },

  getTodayRevenue: () => {
    const db = getDb();
    return db.prepare("SELECT SUM(amount) as total FROM transactions WHERE status = 'completed' AND type = 'deposit' AND date(created_at) = date('now')").get().total || 0;
  }
};

// =============================================
// ORDER QUERIES
// =============================================
const OrderDB = {
  create: (data) => {
    const db = getDb();
    const orderId = `ORD-${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
    const expireMinutes = parseInt(process.env.VERIFICATION_EXPIRE_MINUTES) || 30;
    const cancelMinutes = parseInt(process.env.VERIFICATION_CANCEL_MINUTES) || 3;
    const expiresAt = new Date(Date.now() + expireMinutes * 60000).toISOString();
    const cancelAt = new Date(Date.now() + cancelMinutes * 60000).toISOString();

    db.prepare(`
      INSERT INTO orders 
      (order_id, user_id, status, service_type, target_data, price, expires_at, auto_cancel_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, data.user_id, 'pending', data.service_type || 'verification',
      data.target_data || null, data.price, expiresAt, cancelAt);
    return orderId;
  },

  update: (orderId, data) => {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), new Date().toISOString(), orderId];
    return db.prepare(`UPDATE orders SET ${fields}, updated_at = ? WHERE order_id = ?`).run(...values);
  },

  findById: (orderId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  },

  getByUser: (userId, limit = 10) => {
    const db = getDb();
    return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
  },

  getPending: () => {
    const db = getDb();
    return db.prepare("SELECT * FROM orders WHERE status = 'pending'").all();
  },

  getExpired: () => {
    const db = getDb();
    return db.prepare("SELECT * FROM orders WHERE status = 'pending' AND auto_cancel_at < datetime('now')").all();
  },

  countToday: () => {
    const db = getDb();
    return db.prepare("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')").get().count;
  },

  countCompleted: () => {
    const db = getDb();
    return db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count;
  }
};

// =============================================
// TICKET QUERIES
// =============================================
const TicketDB = {
  create: (userId, subject) => {
    const db = getDb();
    const ticketId = `TKT-${Date.now()}-${uuidv4().substring(0, 4).toUpperCase()}`;
    db.prepare('INSERT INTO tickets (ticket_id, user_id, subject) VALUES (?, ?, ?)').run(ticketId, userId, subject);
    return ticketId;
  },

  findById: (ticketId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
  },

  getByUser: (userId) => {
    const db = getDb();
    return db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(userId);
  },

  getOpen: () => {
    const db = getDb();
    return db.prepare("SELECT t.*, u.username, u.first_name FROM tickets t LEFT JOIN users u ON t.user_id = u.telegram_id WHERE t.status = 'open' ORDER BY t.created_at DESC").all();
  },

  close: (ticketId) => {
    const db = getDb();
    return db.prepare("UPDATE tickets SET status = 'closed', closed_at = ?, updated_at = ? WHERE ticket_id = ?")
      .run(new Date().toISOString(), new Date().toISOString(), ticketId);
  },

  addMessage: (ticketId, senderId, senderType, content) => {
    const db = getDb();
    return db.prepare('INSERT INTO messages (ticket_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)').run(ticketId, senderId, senderType, content);
  },

  getMessages: (ticketId) => {
    const db = getDb();
    return db.prepare('SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
  }
};

// =============================================
// SETTINGS QUERIES
// =============================================
const SettingsDB = {
  get: (key) => {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  set: (key, value) => {
    const db = getDb();
    return db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, new Date().toISOString());
  },

  getAll: () => {
    const db = getDb();
    return db.prepare('SELECT * FROM settings').all();
  }
};

// =============================================
// STATISTICS QUERIES
// =============================================
const StatsDB = {
  getSummary: () => {
    const db = getDb();
    return {
      totalUsers: UserDB.count(),
      newUsersToday: UserDB.countToday(),
      totalOrders: OrderDB.countCompleted(),
      ordersToday: OrderDB.countToday(),
      totalRevenue: TransactionDB.getTotalRevenue(),
      revenueToday: TransactionDB.getTodayRevenue()
    };
  },

  getWeekly: () => {
    const db = getDb();
    return db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as orders, SUM(amount) as revenue
      FROM transactions 
      WHERE status = 'completed' AND created_at >= datetime('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();
  }
};

module.exports = { UserDB, AdminDB, TransactionDB, OrderDB, TicketDB, SettingsDB, StatsDB };
