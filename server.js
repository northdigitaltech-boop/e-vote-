require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

// Frontend dir: index.html sits next to server.js (flat layout) or one level up.
const FRONTEND_DIR = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.join(__dirname, '..');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin:       process.env.FRONTEND_URL || '*',
  methods:      ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(FRONTEND_DIR, 'uploads')));
app.use(express.static(FRONTEND_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/candidates', require('./candidates'));
app.use('/api/unions',     require('./unions'));
app.use('/api/votes',      require('./votes'));
app.use('/api/admin',      require('./admin'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Halqa 4 Roundu API', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Auto-create tables + seed (idempotent) ─────────────────────────────────────
async function initDb(db) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS candidates (
      id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL,
      party_name VARCHAR(100) NOT NULL, symbol VARCHAR(100), photo VARCHAR(500),
      description TEXT, active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS unions (
      id INT PRIMARY KEY AUTO_INCREMENT, union_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS voters (
      id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL,
      mobile VARCHAR(20) NOT NULL UNIQUE, email VARCHAR(255), village VARCHAR(255),
      union_id INT, ip_address VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (union_id) REFERENCES unions(id))`,
    `CREATE TABLE IF NOT EXISTS votes (
      id INT PRIMARY KEY AUTO_INCREMENT, voter_id INT NOT NULL, candidate_id INT NOT NULL,
      union_id INT NOT NULL, vote_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (voter_id) REFERENCES voters(id),
      FOREIGN KEY (candidate_id) REFERENCES candidates(id),
      FOREIGN KEY (union_id) REFERENCES unions(id))`,
    `CREATE TABLE IF NOT EXISTS otps (
      id INT PRIMARY KEY AUTO_INCREMENT, mobile VARCHAR(20) NOT NULL,
      otp_code VARCHAR(6) NOT NULL, expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_mobile (mobile))`,
    `CREATE TABLE IF NOT EXISTS admin_users (
      id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INT PRIMARY KEY AUTO_INCREMENT, action VARCHAR(100) NOT NULL, details TEXT,
      ip_address VARCHAR(50), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const sql of tables) await db.execute(sql);

  const [[{ c }]] = await db.execute('SELECT COUNT(*) AS c FROM unions');
  if (c === 0) {
    await db.execute(`INSERT INTO unions (union_name) VALUES
      ('Union Council Roundu'),('Union Council Ghasing'),('Union Council Kalam'),
      ('Union Council Bahrain'),('Union Council Madyan')`);
  }
  const [[{ cc }]] = await db.execute('SELECT COUNT(*) AS cc FROM candidates');
  if (cc === 0) {
    await db.execute(`INSERT INTO candidates (name, party_name, symbol, description) VALUES
      ('Raja Nasir Ali Khan','PPP','Arrow','PPP candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Wazir Hassan','PML-N','Tiger','PML-N candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Muhammad Khan','IPP','Eagle','IPP candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Muhammad Sharif (Dr. Sharif)','PTI','Cricket Bat','PTI candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Mushtaq Hakimi','MWM','Tent','MWM candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Muhammad Kabir','PNP','Railway Engine','PNP candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Shaban Ali','Independent','Star','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Safdar Ali','Independent','Pine Apple','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Alam Noor','Independent','Topi Shanti','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Nazim Hussain','AWP','Bulb','AWP candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Wazir Muhammad Kazim','Independent','Key with Lock','Independent candidate for GBA-10 Skardu-IV (Roundu).'),
      ('Wazir Ejaz','Independent','Two Swords','Independent candidate for GBA-10 Skardu-IV (Roundu).')`);
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  const db = require('./db');
  console.log('🔌 Connecting to MySQL…');
  try {
    await db.execute('SELECT 1');
    console.log('✅ MySQL connected.');
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }

  try {
    await initDb(db);
    console.log('✅ Tables ready & seed data ensured.');
  } catch (err) {
    console.error('⚠️  DB init warning:', err.message);
  }

  const [admins] = await db.execute('SELECT id FROM admin_users LIMIT 1');
  if (!admins.length) {
    const uname = process.env.ADMIN_USERNAME || 'admin';
    const pass  = process.env.ADMIN_PASSWORD || 'admin123';
    const hash  = await bcrypt.hash(pass, 10);
    await db.execute('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [uname, hash]);
    console.log(`✅ Admin user created → ${uname}`);
  }

  app.listen(PORT, () => {
    console.log('🗳️  Halqa 4 Roundu Pre-Polling System running on port ' + PORT);
  });
}

start();
