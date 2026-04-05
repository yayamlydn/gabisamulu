// src/admin/server.js
// Web Admin Panel Server

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('../utils/logger');
const { UserDB, AdminDB, OrderDB, TransactionDB, TicketDB, StatsDB, SettingsDB } = require('../database/queries');
const { formatCurrency, formatDate, statusBadge } = require('../utils/helpers');

const app = express();
const PORT = process.env.ADMIN_PANEL_PORT || 4000;

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts' });

// =============================================
// AUTH MIDDLEWARE
// =============================================
const requireAuth = (req, res, next) => {
  if (req.session?.admin) return next();
  if (req.headers['content-type'] === 'application/json') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  res.redirect('/admin/login');
};

// =============================================
// ADMIN PANEL HTML (Single Page)
// =============================================
const getAdminHTML = (page, data = {}) => `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel - Business Verification Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f13; color: #e2e8f0; min-height: 100vh; }
    .sidebar { width: 250px; background: #1a1a24; height: 100vh; position: fixed; left: 0; top: 0; padding: 20px 0; border-right: 1px solid #2d2d3d; z-index: 100; }
    .logo { padding: 0 20px 20px; border-bottom: 1px solid #2d2d3d; margin-bottom: 20px; }
    .logo h2 { color: #7c3aed; font-size: 16px; }
    .logo p { color: #64748b; font-size: 12px; margin-top: 4px; }
    .nav-item { display: flex; align-items: center; padding: 12px 20px; color: #94a3b8; text-decoration: none; font-size: 14px; cursor: pointer; transition: all 0.2s; border: none; background: none; width: 100%; text-align: left; }
    .nav-item:hover, .nav-item.active { background: #7c3aed22; color: #a78bfa; border-left: 3px solid #7c3aed; }
    .nav-item span { margin-right: 10px; font-size: 18px; }
    .main { margin-left: 250px; padding: 30px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .header h1 { font-size: 24px; color: #f1f5f9; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 12px; padding: 20px; }
    .stat-card .label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .stat-card .value { font-size: 28px; font-weight: 700; margin-top: 8px; color: #f1f5f9; }
    .stat-card .sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .card { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .card h3 { font-size: 16px; margin-bottom: 16px; color: #f1f5f9; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 12px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2d2d3d; }
    td { padding: 12px; border-bottom: 1px solid #1e1e2d; color: #cbd5e1; }
    tr:hover td { background: #ffffff06; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .badge-success { background: #064e3b; color: #34d399; }
    .badge-warning { background: #451a03; color: #fbbf24; }
    .badge-danger { background: #450a0a; color: #f87171; }
    .badge-info { background: #172554; color: #60a5fa; }
    .btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .btn-primary { background: #7c3aed; color: white; }
    .btn-primary:hover { background: #6d28d9; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 6px; color: #94a3b8; font-size: 13px; }
    .form-control { width: 100%; padding: 10px 14px; background: #0f0f13; border: 1px solid #2d2d3d; border-radius: 8px; color: #e2e8f0; font-size: 14px; outline: none; }
    .form-control:focus { border-color: #7c3aed; }
    .login-page { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f0f13; }
    .login-box { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 16px; padding: 40px; width: 360px; }
    .login-box h2 { color: #7c3aed; margin-bottom: 8px; }
    .login-box p { color: #64748b; font-size: 14px; margin-bottom: 28px; }
    .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .alert-danger { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
    .alert-success { background: #064e3b; color: #34d399; }
    .pagination { display: flex; gap: 8px; margin-top: 16px; }
    .pagination a { padding: 6px 12px; background: #2d2d3d; border-radius: 6px; color: #94a3b8; text-decoration: none; font-size: 13px; }
    .pagination a.active { background: #7c3aed; color: white; }
    .search-bar { display: flex; gap: 10px; margin-bottom: 16px; }
    .search-bar input { flex: 1; }
  </style>
</head>
<body>
${page === 'login' ? renderLogin(data) : renderDashboard(page, data)}
<script>
  function navigate(page) { window.location.href = '/admin/' + page; }
  function logout() { fetch('/admin/logout', {method:'POST'}).then(() => location.href='/admin/login'); }
  function banUser(id) { if(confirm('Ban user ini?')) fetch('/admin/api/users/' + id + '/ban', {method:'POST'}).then(() => location.reload()); }
  function unbanUser(id) { if(confirm('Unban user ini?')) fetch('/admin/api/users/' + id + '/unban', {method:'POST'}).then(() => location.reload()); }
  function topupUser(id) { 
    const amt = prompt('Masukkan nominal top up (IDR):');
    if(amt && !isNaN(amt)) fetch('/admin/api/users/' + id + '/topup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({amount: parseFloat(amt)})}).then(() => location.reload());
  }
  function closeTicket(id) { if(confirm('Tutup tiket ini?')) fetch('/admin/api/tickets/' + id + '/close', {method:'POST'}).then(() => location.reload()); }
  function broadcastMsg() {
    const msg = prompt('Pesan broadcast (Markdown):');
    if(msg) {
      fetch('/admin/api/broadcast', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message: msg})})
        .then(r=>r.json()).then(d=>alert(d.message || 'Broadcast dikirim!'));
    }
  }
</script>
</body>
</html>
`;

const renderLogin = (data) => `
<div class="login-page">
  <div class="login-box">
    <h2>⚙️ Admin Panel</h2>
    <p>Business Verification Bot</p>
    ${data.error ? `<div class="alert alert-danger">${data.error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="form-group">
        <label>Username</label>
        <input name="username" class="form-control" placeholder="admin" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input name="password" type="password" class="form-control" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;padding:12px">Masuk</button>
    </form>
  </div>
</div>
`;

const renderDashboard = (page, data) => `
<div class="sidebar">
  <div class="logo">
    <h2>⚙️ Admin Panel</h2>
    <p>Bot Management</p>
  </div>
  <button class="nav-item ${page==='dashboard'?'active':''}" onclick="navigate('dashboard')"><span>📊</span>Dashboard</button>
  <button class="nav-item ${page==='users'?'active':''}" onclick="navigate('users')"><span>👥</span>Users</button>
  <button class="nav-item ${page==='orders'?'active':''}" onclick="navigate('orders')"><span>📦</span>Orders</button>
  <button class="nav-item ${page==='transactions'?'active':''}" onclick="navigate('transactions')"><span>💳</span>Transaksi</button>
  <button class="nav-item ${page==='tickets'?'active':''}" onclick="navigate('tickets')"><span>🎫</span>Tiket</button>
  <button class="nav-item" onclick="broadcastMsg()"><span>📢</span>Broadcast</button>
  <button class="nav-item ${page==='settings'?'active':''}" onclick="navigate('settings')"><span>⚙️</span>Pengaturan</button>
  <button class="nav-item" onclick="logout()" style="margin-top:auto;position:absolute;bottom:20px;width:100%"><span>🚪</span>Logout</button>
</div>
<div class="main">
  <div class="header"><h1>${getPageTitle(page)}</h1></div>
  ${getPageContent(page, data)}
</div>
`;

const getPageTitle = (page) => ({ dashboard:'Dashboard', users:'Manajemen User', orders:'Order', transactions:'Transaksi', tickets:'Support Tiket', settings:'Pengaturan' }[page] || page);

const getPageContent = (page, data) => {
  switch(page) {
    case 'dashboard': return renderDashboardPage(data);
    case 'users': return renderUsersPage(data);
    case 'orders': return renderOrdersPage(data);
    case 'transactions': return renderTransactionsPage(data);
    case 'tickets': return renderTicketsPage(data);
    case 'settings': return renderSettingsPage(data);
    default: return '<p>Page not found</p>';
  }
};

const renderDashboardPage = (data) => `
<div class="stats-grid">
  <div class="stat-card"><div class="label">Total Users</div><div class="value">${data.stats?.totalUsers?.toLocaleString('id-ID') || 0}</div><div class="sub">+${data.stats?.newUsersToday || 0} hari ini</div></div>
  <div class="stat-card"><div class="label">Total Orders</div><div class="value">${data.stats?.totalOrders || 0}</div><div class="sub">${data.stats?.ordersToday || 0} hari ini</div></div>
  <div class="stat-card"><div class="label">Revenue Hari Ini</div><div class="value" style="font-size:18px">${formatCurrency(data.stats?.revenueToday || 0)}</div></div>
  <div class="stat-card"><div class="label">Total Revenue</div><div class="value" style="font-size:18px">${formatCurrency(data.stats?.totalRevenue || 0)}</div></div>
</div>
<div class="card">
  <h3>📈 Order Terbaru</h3>
  <table><tr><th>Order ID</th><th>User</th><th>Harga</th><th>Status</th><th>Tanggal</th></tr>
  ${(data.recentOrders||[]).map(o=>`<tr><td><code>${o.order_id}</code></td><td>${o.first_name||o.user_id}</td><td>${formatCurrency(o.price)}</td><td><span class="badge badge-${o.status==='completed'?'success':o.status==='pending'?'warning':'danger'}">${o.status}</span></td><td>${formatDate(o.created_at)}</td></tr>`).join('')}
  </table>
</div>
`;

const renderUsersPage = (data) => `
<div class="card">
  <div class="search-bar">
    <input class="form-control" id="searchInput" placeholder="Cari user..." onkeyup="searchUsers()">
  </div>
  <table><tr><th>ID</th><th>Nama</th><th>Username</th><th>Saldo</th><th>Orders</th><th>Status</th><th>Aksi</th></tr>
  ${(data.users||[]).map(u=>`<tr><td><code>${u.telegram_id}</code></td><td>${u.first_name||'-'}</td><td>@${u.username||'-'}</td><td>${formatCurrency(u.balance||0)}</td><td>${u.total_orders||0}</td><td><span class="badge ${u.is_banned?'badge-danger':'badge-success'}">${u.is_banned?'Banned':'Aktif'}</span></td><td><button class="btn btn-sm btn-primary" onclick="topupUser('${u.telegram_id}')">💰</button> ${u.is_banned?`<button class="btn btn-sm btn-primary" onclick="unbanUser('${u.telegram_id}')">✅</button>`:`<button class="btn btn-sm btn-danger" onclick="banUser('${u.telegram_id}')">🚫</button>`}</td></tr>`).join('')}
  </table>
  <div class="pagination">${Array.from({length:data.totalPages||1},(_,i)=>`<a href="?page=${i+1}" class="${(data.page||1)===(i+1)?'active':''}">${i+1}</a>`).join('')}</div>
</div>
<script>function searchUsers(){const v=document.getElementById('searchInput').value;if(v.length>2)window.location.href='?search='+v;}</script>
`;

const renderOrdersPage = (data) => `
<div class="card">
  <table><tr><th>Order ID</th><th>User</th><th>Target</th><th>Harga</th><th>Kode</th><th>Status</th><th>Tanggal</th></tr>
  ${(data.orders||[]).map(o=>`<tr><td><code>${o.order_id}</code></td><td>${o.first_name||o.user_id}</td><td>${o.target_data||'-'}</td><td>${formatCurrency(o.price)}</td><td>${o.verification_code?`<code>${o.verification_code}</code>`:'-'}</td><td><span class="badge badge-${o.status==='completed'?'success':o.status==='pending'?'warning':'danger'}">${o.status}</span></td><td>${formatDate(o.created_at)}</td></tr>`).join('')}
  </table>
</div>
`;

const renderTransactionsPage = (data) => `
<div class="card">
  <table><tr><th>ID</th><th>User</th><th>Tipe</th><th>Nominal</th><th>Status</th><th>Tanggal</th></tr>
  ${(data.transactions||[]).map(t=>`<tr><td><code>${t.transaction_id}</code></td><td>${t.user_id}</td><td>${t.type}</td><td>${formatCurrency(t.amount)}</td><td><span class="badge badge-${t.status==='completed'?'success':t.status==='pending'?'warning':'danger'}">${t.status}</span></td><td>${formatDate(t.created_at)}</td></tr>`).join('')}
  </table>
</div>
`;

const renderTicketsPage = (data) => `
<div class="card">
  <table><tr><th>Ticket ID</th><th>User</th><th>Subjek</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr>
  ${(data.tickets||[]).map(t=>`<tr><td><code>${t.ticket_id}</code></td><td>${t.first_name||t.user_id}</td><td>${t.subject}</td><td><span class="badge badge-${t.status==='open'?'success':'info'}">${t.status}</span></td><td>${formatDate(t.created_at)}</td><td>${t.status==='open'?`<button class="btn btn-sm btn-danger" onclick="closeTicket('${t.ticket_id}')">Tutup</button>`:''}</td></tr>`).join('')}
  </table>
</div>
`;

const renderSettingsPage = (data) => `
<div class="card">
  <form method="POST" action="/admin/settings/save">
  <table><tr><th>Key</th><th>Value</th><th>Deskripsi</th></tr>
  ${(data.settings||[]).map(s=>`<tr><td><code>${s.key}</code></td><td><input class="form-control" name="${s.key}" value="${s.value||''}"></td><td>${s.description||''}</td></tr>`).join('')}
  </table>
  <br><button type="submit" class="btn btn-primary">💾 Simpan Pengaturan</button>
  </form>
</div>
`;

// =============================================
// ROUTES
// =============================================
app.get('/admin/login', (req, res) => {
  if (req.session?.admin) return res.redirect('/admin/dashboard');
  res.send(getAdminHTML('login', {}));
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (username === adminUser && password === adminPass) {
    req.session.admin = { username, role: 'super_admin' };
    return res.redirect('/admin/dashboard');
  }
  res.send(getAdminHTML('login', { error: 'Username atau password salah!' }));
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Protected routes
app.get('/admin/dashboard', requireAuth, (req, res) => {
  const stats = StatsDB.getSummary();
  const db = require('../database/schema').getDb();
  const recentOrders = db.prepare('SELECT o.*, u.first_name FROM orders o LEFT JOIN users u ON o.user_id = u.telegram_id ORDER BY o.created_at DESC LIMIT 10').all();
  res.send(getAdminHTML('dashboard', { stats, recentOrders }));
});

app.get('/admin/users', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const search = req.query.search;
  const users = search ? UserDB.search(search) : UserDB.getAll(limit, (page-1)*limit);
  const total = UserDB.count();
  res.send(getAdminHTML('users', { users, page, totalPages: Math.ceil(total/limit) }));
});

app.get('/admin/orders', requireAuth, (req, res) => {
  const db = require('../database/schema').getDb();
  const orders = db.prepare('SELECT o.*, u.first_name FROM orders o LEFT JOIN users u ON o.user_id = u.telegram_id ORDER BY o.created_at DESC LIMIT 50').all();
  res.send(getAdminHTML('orders', { orders }));
});

app.get('/admin/transactions', requireAuth, (req, res) => {
  const db = require('../database/schema').getDb();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50').all();
  res.send(getAdminHTML('transactions', { transactions }));
});

app.get('/admin/tickets', requireAuth, (req, res) => {
  const db = require('../database/schema').getDb();
  const tickets = db.prepare('SELECT t.*, u.first_name FROM tickets t LEFT JOIN users u ON t.user_id = u.telegram_id ORDER BY t.created_at DESC').all();
  res.send(getAdminHTML('tickets', { tickets }));
});

app.get('/admin/settings', requireAuth, (req, res) => {
  const settings = SettingsDB.getAll();
  res.send(getAdminHTML('settings', { settings }));
});

app.post('/admin/settings/save', requireAuth, (req, res) => {
  Object.entries(req.body).forEach(([key, value]) => SettingsDB.set(key, value));
  res.redirect('/admin/settings');
});

// API endpoints
app.post('/admin/api/users/:id/ban', requireAuth, (req, res) => {
  UserDB.ban(req.params.id);
  res.json({ success: true });
});

app.post('/admin/api/users/:id/unban', requireAuth, (req, res) => {
  UserDB.unban(req.params.id);
  res.json({ success: true });
});

app.post('/admin/api/users/:id/topup', requireAuth, (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ success: false });
  UserDB.updateBalance(req.params.id, parseFloat(amount));
  res.json({ success: true });
});

app.post('/admin/api/tickets/:id/close', requireAuth, (req, res) => {
  TicketDB.close(req.params.id);
  res.json({ success: true });
});

app.post('/admin/api/broadcast', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false });
  
  // This will be handled by the main bot process via inter-process communication
  // For now, just log it
  logger.info(`Broadcast requested from admin panel: ${message.substring(0, 50)}...`);
  res.json({ success: true, message: 'Broadcast akan dikirim oleh bot.' });
});

app.get('/admin', (req, res) => res.redirect('/admin/dashboard'));

// =============================================
// START SERVER
// =============================================
if (require.main === module) {
  const { initializeDatabase } = require('../database/schema');
  initializeDatabase();
  
  app.listen(PORT, () => {
    logger.info(`Admin Panel running at http://localhost:${PORT}/admin`);
    logger.info(`Login: ${process.env.ADMIN_USERNAME || 'admin'} / [ADMIN_PASSWORD from .env]`);
  });
}

module.exports = { app };
