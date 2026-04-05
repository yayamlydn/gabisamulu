// scripts/setup.js
// One-time setup script — safe to run during Railway build

const fs   = require('fs');
const path = require('path');

console.log('\n🚀 Running setup...\n');

// Resolve base dir (works both from /scripts and from root)
const baseDir = path.resolve(__dirname, '..');

// Create required directories
const dirs = [
  path.join(baseDir, 'data'),
  path.join(baseDir, 'logs'),
  path.join(baseDir, 'public', 'css'),
  path.join(baseDir, 'public', 'js')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  }
});

// Copy .env.example → .env only on local (not on Railway)
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
if (!isRailway && !fs.existsSync(path.join(baseDir, '.env')) && fs.existsSync(path.join(baseDir, '.env.example'))) {
  fs.copyFileSync(
    path.join(baseDir, '.env.example'),
    path.join(baseDir, '.env')
  );
  console.log('✅ Created .env from .env.example');
  console.log('⚠️  Edit .env with your actual values!\n');
}

// Try init DB only if env vars are available
try {
  // Load dotenv only on local
  if (!isRailway) require('dotenv').config({ path: path.join(baseDir, '.env') });

  if (process.env.DATABASE_PATH || !isRailway) {
    const { initializeDatabase } = require('../src/database/schema');
    initializeDatabase();
    console.log('✅ Database initialized');
  }
} catch (e) {
  console.log('ℹ️  DB init deferred to runtime:', e.message);
}

console.log('\n✅ Setup complete!\n');
