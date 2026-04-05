// src/database/schema.js
// Database Schema & Initialization for Business Verification Bot

const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

let db;

function getDb() {
  if (!db) {
    // Resolve path — respect env var, fallback to cwd/data/bot.db
    const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.db'));
    const dir    = path.dirname(dbPath);

    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');

    console.log(`[DB] Connected: ${dbPath}`);
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();
  console.log('[DB] Initializing schema...');

  database.exec(`
    -- =============================================
    -- TABLE: users
    -- =============================================
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      balance REAL DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      captcha_passed INTEGER DEFAULT 0,
      joined_channel INTEGER DEFAULT 0,
      joined_group INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_active TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- TABLE: admins
    -- =============================================
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      role TEXT DEFAULT 'admin',
      is_active INTEGER DEFAULT 1,
      permissions TEXT DEFAULT '[]',
      added_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- TABLE: transactions
    -- =============================================
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      payment_ref TEXT,
      mayar_invoice_id TEXT,
      mayar_payment_url TEXT,
      description TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    );

    -- =============================================
    -- TABLE: orders
    -- =============================================
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      service_type TEXT,
      target_data TEXT,
      result_data TEXT,
      price REAL NOT NULL,
      verification_code TEXT,
      code_fetched_at TEXT,
      expires_at TEXT,
      auto_cancel_at TEXT,
      notes TEXT,
      processed_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    );

    -- =============================================
    -- TABLE: tickets
    -- =============================================
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'normal',
      assigned_to TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    );

    -- =============================================
    -- TABLE: messages (ticket replies & live chat)
    -- =============================================
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT,
      sender_id TEXT NOT NULL,
      sender_type TEXT DEFAULT 'user',
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
    );

    -- =============================================
    -- TABLE: statistics
    -- =============================================
    CREATE TABLE IF NOT EXISTS statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      cancelled_orders INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_deposits REAL DEFAULT 0,
      active_users INTEGER DEFAULT 0,
      UNIQUE(date)
    );

    -- =============================================
    -- TABLE: settings
    -- =============================================
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- TABLE: captcha_sessions
    -- =============================================
    CREATE TABLE IF NOT EXISTS captcha_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    -- =============================================
    -- TABLE: broadcast_logs
    -- =============================================
    CREATE TABLE IF NOT EXISTS broadcast_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      message TEXT NOT NULL,
      target_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- INDEXES
    -- =============================================
    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);

    -- =============================================
    -- DEFAULT SETTINGS
    -- =============================================
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
      ('maintenance_mode', 'false', 'Enable/disable maintenance mode'),
      ('order_price', '10000', 'Default order price in IDR'),
      ('min_deposit', '5000', 'Minimum deposit amount in IDR'),
      ('max_deposit', '10000000', 'Maximum deposit amount in IDR'),
      ('welcome_message', 'Selamat datang di Business Verification Bot! 🎉', 'Welcome message'),
      ('bot_name', 'Business Verification Bot', 'Bot display name'),
      ('currency', 'IDR', 'Currency code'),
      ('verification_expire', '30', 'Verification expire time in minutes'),
      ('verification_cancel', '3', 'Verification cancel time in minutes');
  `);

  console.log('[DB] Schema ready ✅');
  return database;
}

module.exports = { getDb, initializeDatabase };
