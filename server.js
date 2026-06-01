require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

// Auto-detect where the frontend (index.html) lives:
//   • alongside server.js  (Hostinger: backend contents in public_html)
//   • one level up         (local dev: index.html in project root)
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

// Serve uploaded photos
app.use('/uploads', express.static(path.join(FRONTEND_DIR, 'uploads')));

// Serve the HTML frontend
app.use(express.static(FRONTEND_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/candidates', require('./candidates'));
app.use('/api/unions',     require('./unions'));
app.use('/api/votes',      require('./votes'));
app.use('/api/admin',      require('./admin'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Halqa 4 Roundu API', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  }
  // Serve frontend for non-API routes
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  const db = require('./db');

  console.log('🔌 Connecting to MySQL…');
  try {
    await db.execute('SELECT 1');
    console.log('✅ MySQL connected.');
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    console.error('   → Make sure MySQL is running and .env is configured.');
    process.exit(1);
  }

  // Auto-create admin user if none exists
  const [admins] = await db.execute('SELECT id FROM admin_users LIMIT 1');
  if (!admins.length) {
    const uname = process.env.ADMIN_USERNAME || 'admin';
    const pass  = process.env.ADMIN_PASSWORD || 'admin123';
    const hash  = await bcrypt.hash(pass, 10);
    await db.execute(
      'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
      [uname, hash]
    );
    console.log(`✅ Admin user created  →  username: ${uname}  password: ${pass}`);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('🗳️  Halqa 4 Roundu Pre-Polling System');
    console.log('─────────────────────────────────────────');
    console.log(`🚀  API running at  : http://localhost:${PORT}/api`);
    console.log(`🌐  Frontend at     : http://localhost:${PORT}`);
    console.log(`❤️   Health check   : http://localhost:${PORT}/api/health`);
    console.log('─────────────────────────────────────────');
    console.log('');
  });
}

start();
