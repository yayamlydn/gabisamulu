# 📦 Business Verification Telegram Bot
## Panduan Setup & Deployment (Lokal + Railway)

---

## 🗂️ Struktur Folder Project

```
telegram-bot/
├── src/
│   ├── index.js                  ← Entry point utama
│   ├── bot/
│   │   ├── index.js              ← Setup bot, routing semua commands & actions
│   │   ├── handlers.js           ← Handler user: start, profile, order, deposit, ticket
│   │   └── admin.js              ← Handler admin: stats, users, broadcast, settings
│   ├── database/
│   │   ├── schema.js             ← Inisialisasi SQLite & semua CREATE TABLE
│   │   └── queries.js            ← Query helper: UserDB, OrderDB, TransactionDB, dll
│   ├── middleware/
│   │   └── auth.js               ← Middleware: registerUser, checkBan, captcha, membership
│   ├── payment/
│   │   └── webhook.js            ← Webhook server: Mayar.id + Verification callback
│   ├── services/
│   │   ├── payment.js            ← Mayar.id API: createInvoice, verifySignature
│   │   └── verification.js       ← Verification API: submit, fetchCode, autoCancel
│   ├── admin/
│   │   └── server.js             ← Web Admin Panel (Express HTML server)
│   └── utils/
│       ├── logger.js             ← Winston logger
│       ├── helpers.js            ← formatCurrency, captcha, escapeMarkdown, dll
│       ├── keyboards.js          ← Semua inline keyboard Telegram
│       └── storage.js            ← Railway persistent volume path manager
├── scripts/
│   └── setup.js                  ← Script setup awal (buat folder, init DB)
├── data/                         ← Database SQLite (auto-created, persistent)
├── logs/                         ← Log files (auto-created)
├── .env.example                  ← Template environment variables
├── .gitignore
├── Procfile                      ← Railway / Heroku process file
├── railway.json                  ← Railway deployment config
├── nixpacks.toml                 ← Railway build config
└── package.json
```

---

## ✅ Cara Install (Lokal / VPS)

### 1. Clone / Extract Project

```bash
cd telegram-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment

```bash
cp .env.example .env
nano .env   # atau gunakan editor favorit
```

Isi minimal ini di `.env`:

```env
BOT_TOKEN=your_bot_token_dari_botfather
SUPER_ADMIN_ID=telegram_id_kamu
WEBHOOK_DOMAIN=https://domain-kamu.com   # kosongkan untuk mode polling
DATABASE_PATH=./data/bot.db
MAYAR_API_KEY=api_key_mayar
MAYAR_WEBHOOK_SECRET=webhook_secret_mayar
```

### 4. Jalankan Setup

```bash
npm run setup
```

### 5. Jalankan Bot

```bash
# Development (polling mode, tanpa domain)
npm run dev

# Production
npm start
```

---

## 🚂 Deploy ke Railway (Recommended)

### Langkah 1 — Buat Project Railway

1. Buka [railway.app](https://railway.app) dan login
2. Klik **New Project** → **Deploy from GitHub repo**
3. Hubungkan repo GitHub kamu

### Langkah 2 — Set Environment Variables

Di Railway dashboard → Service → **Variables**, tambahkan semua ini:

| Variable | Nilai | Keterangan |
|----------|-------|------------|
| `BOT_TOKEN` | `123456:ABC...` | Dari @BotFather |
| `SUPER_ADMIN_ID` | `123456789` | Telegram ID kamu |
| `WEBHOOK_DOMAIN` | `https://yourapp.up.railway.app` | Domain Railway kamu |
| `DATABASE_PATH` | `/app/data/bot.db` | Path persistent volume |
| `LOG_FILE` | `/app/logs/bot.log` | Path log file |
| `MAYAR_API_KEY` | `your_key` | API key Mayar.id |
| `MAYAR_WEBHOOK_SECRET` | `your_secret` | Webhook secret Mayar.id |
| `ADMIN_USERNAME` | `admin` | Login panel admin |
| `ADMIN_PASSWORD` | `SecurePass123!` | Password panel admin |
| `SESSION_SECRET` | `64_char_random_string` | Secret session |
| `NODE_ENV` | `production` | Mode production |
| `REQUIRED_CHANNEL_ID` | `-100xxxxxxxxx` | ID channel wajib join |
| `REQUIRED_CHANNEL_USERNAME` | `@channel` | Username channel |
| `ORDER_PRICE` | `10000` | Harga order (IDR) |
| `VERIFICATION_EXPIRE_MINUTES` | `30` | Expire order (menit) |
| `VERIFICATION_CANCEL_MINUTES` | `3` | Auto-cancel (menit) |

### Langkah 3 — Setup Persistent Volume (WAJIB untuk SQLite)

> ⚠️ Tanpa ini, database akan **hilang** setiap deploy!

1. Railway Dashboard → Service → **Settings**
2. Scroll ke **Volumes** → klik **Add Volume**
3. Isi:
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB (cukup untuk SQLite)
4. Klik **Create**
5. Pastikan `DATABASE_PATH=/app/data/bot.db` di Variables

### Langkah 4 — Konfigurasi Domain

1. Railway → Service → **Settings** → **Networking**
2. Klik **Generate Domain** → Railway beri domain `*.up.railway.app`
3. Copy domain tersebut ke variable `WEBHOOK_DOMAIN`

### Langkah 5 — Deploy!

Push ke GitHub atau klik **Deploy** manual di Railway. Railway akan otomatis:
- Install dependencies (`npm install`)
- Run setup script
- Start bot dengan webhook mode

---

## 🔗 Webhook Endpoints

Setelah deploy, bot mengexpose endpoint berikut:

| Method | Path | Fungsi |
|--------|------|--------|
| `GET` | `/health` | Health check server |
| `POST` | `/webhook/mayar` | Callback pembayaran Mayar.id |
| `POST` | `/webhook/verification` | Callback hasil verifikasi |
| `POST` | `/bot{TOKEN}` | Telegram webhook (internal) |

### Konfigurasi Webhook Mayar.id

Di dashboard Mayar.id, set webhook URL ke:
```
https://yourapp.up.railway.app/webhook/mayar
```

---

## 🗄️ Database Schema

Bot menggunakan **SQLite** dengan tabel berikut:

| Tabel | Fungsi |
|-------|--------|
| `users` | Data semua user Telegram |
| `admins` | Daftar admin bot |
| `transactions` | Riwayat deposit & pembayaran |
| `orders` | Order verifikasi |
| `tickets` | Tiket support user |
| `messages` | Pesan dalam tiket |
| `statistics` | Statistik harian |
| `settings` | Konfigurasi bot (dinamis) |
| `captcha_sessions` | Sesi captcha user |
| `broadcast_logs` | Log broadcast admin |

---

## ⚙️ Web Admin Panel

Panel admin berjalan di port `4000` (atau sesuai `ADMIN_PANEL_PORT`).

Untuk menjalankan terpisah:
```bash
node src/admin/server.js
```

Di Railway, deploy sebagai **service terpisah** jika ingin admin panel selalu aktif.

**Login:** `http://localhost:4000/admin`
- Username: nilai `ADMIN_USERNAME`
- Password: nilai `ADMIN_PASSWORD`

Fitur panel:
- 📊 Dashboard & statistik real-time
- 👥 Manajemen user (ban, unban, top up saldo)
- 📦 Monitor semua order
- 💳 Riwayat transaksi
- 🎫 Kelola tiket support
- ⚙️ Edit pengaturan bot langsung dari browser

---

## 🤖 Fitur Bot

### User
- `/start` — Menu utama
- 🛒 Order verifikasi (auto-fetch kode)
- 💰 Deposit saldo via Mayar.id
- 👤 Profil & saldo
- 📋 Riwayat order
- 🎫 Buat & kirim tiket support

### Admin (via bot)
- `/admin` — Panel admin di-bot
- `/addadmin <id>` — Tambah admin
- `/removeadmin <id>` — Hapus admin
- `/ban <id>` — Ban user
- `/topup <id> <amount>` — Top up saldo user
- `/stats` — Statistik cepat
- Broadcast ke semua user
- Balas & tutup tiket

---

## 🛡️ Keamanan

- Webhook Mayar.id diverifikasi dengan HMAC-SHA256
- Rate limiter pada login admin panel
- Session expiry 8 jam
- Password login panel di-hash (bcrypt)
- User terverifikasi captcha sebelum akses bot
- Wajib join channel sebelum bisa order

---

## 📝 Logs

Log tersimpan di `/app/logs/` (Railway) atau `./logs/` (lokal):
- `bot.log` — Semua log (info, warn, error)
- `error.log` — Hanya error

Format: JSON dengan timestamp, mudah diparse.

---

## 🐛 Troubleshooting

**Bot tidak merespons setelah deploy Railway:**
- Cek `WEBHOOK_DOMAIN` sudah benar (https, tanpa trailing slash)
- Pastikan PORT sesuai (Railway inject `PORT` otomatis)
- Lihat logs di Railway dashboard

**Database hilang setelah redeploy:**
- Pastikan Railway Volume sudah di-attach ke path `/app/data`
- Pastikan `DATABASE_PATH=/app/data/bot.db`

**Pembayaran tidak dikonfirmasi:**
- Cek webhook URL di dashboard Mayar.id
- Pastikan `MAYAR_WEBHOOK_SECRET` benar
- Cek `/health` endpoint bisa diakses publik

**Panel admin tidak bisa diakses:**
- Jalankan `node src/admin/server.js` terpisah
- Atau deploy sebagai Railway service kedua
