const router  = require('express').Router();
const db      = require('./db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const auth    = require('./auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Photo upload setup ────────────────────────────────────────────────────────
const FRONTEND_DIR = __dirname;
const uploadsDir = path.join(FRONTEND_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'candidate_' + Date.now() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.gif','.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const SECRET  = () => process.env.JWT_SECRET || 'halqa4_secret';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const [rows] = await db.execute('SELECT * FROM admin_users WHERE username = ?', [username.trim()]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials.' });
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ id: rows[0].id, username: rows[0].username }, SECRET(), { expiresIn: '24h' });
    await db.execute("INSERT INTO activity_logs (action, details) VALUES ('ADMIN_LOGIN', ?)", [`Admin logged in: ${username}`]);
    res.json({ token, username: rows[0].username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(auth);

router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
  res.json({ url: '/uploads/' + req.file.filename, message: 'Photo uploaded successfully.' });
});

router.get('/stats', async (req, res) => {
  try {
    const [[{ total_votes }]] = await db.execute('SELECT COUNT(*) AS total_votes FROM votes');
    const [[{ total_voters }]] = await db.execute('SELECT COUNT(*) AS total_voters FROM voters');
    const [[{ total_candidates }]] = await db.execute('SELECT COUNT(*) AS total_candidates FROM candidates WHERE active = 1');
    const [[{ total_unions }]] = await db.execute('SELECT COUNT(*) AS total_unions FROM unions');
    const [candidates] = await db.execute(`
      SELECT c.id, c.name, c.party_name, COUNT(v.id) AS vote_count
      FROM candidates c LEFT JOIN votes v ON v.candidate_id = c.id
      GROUP BY c.id ORDER BY vote_count DESC
    `);
    const [logs] = await db.execute('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 20');
    res.json({ total_votes, total_voters, total_candidates, total_unions, candidates, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/candidates', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT c.*, COUNT(v.id) AS vote_count
      FROM candidates c LEFT JOIN votes v ON v.candidate_id = c.id
      GROUP BY c.id ORDER BY c.id
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/candidates', async (req, res) => {
  const { name, party_name, symbol, photo, description, active } = req.body;
  if (!name || !party_name) return res.status(400).json({ error: 'Name and party name are required.' });
  try {
    const [result] = await db.execute(
      'INSERT INTO candidates (name, party_name, symbol, photo, description, active) VALUES (?,?,?,?,?,?)',
      [name, party_name, symbol || null, photo || null, description || null, active !== false ? 1 : 0]
    );
    await db.execute("INSERT INTO activity_logs (action, details) VALUES ('CANDIDATE_ADDED', ?)", [`Added: ${name} (${party_name})`]);
    res.status(201).json({ id: result.insertId, message: 'Candidate added.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/candidates/:id', async (req, res) => {
  const { name, party_name, symbol, photo, description, active } = req.body;
  try {
    await db.execute(
      'UPDATE candidates SET name=?, party_name=?, symbol=?, photo=?, description=?, active=? WHERE id=?',
      [name, party_name, symbol || null, photo || null, description || null, active ? 1 : 0, req.params.id]
    );
    await db.execute("INSERT INTO activity_logs (action, details) VALUES ('CANDIDATE_UPDATED', ?)", [`Updated ID ${req.params.id}: ${name}`]);
    res.json({ message: 'Candidate updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/candidates/:id', async (req, res) => {
  try {
    const [[{ cnt }]] = await db.execute('SELECT COUNT(*) AS cnt FROM votes WHERE candidate_id = ?', [req.params.id]);
    if (cnt > 0) {
      await db.execute('UPDATE candidates SET active = 0 WHERE id = ?', [req.params.id]);
      return res.json({ message: 'Candidate deactivated (has votes — cannot delete).' });
    }
    await db.execute('DELETE FROM candidates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Candidate deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/unions', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT u.*, COUNT(v.id) AS total_votes
      FROM unions u LEFT JOIN votes v ON v.union_id = u.id
      GROUP BY u.id ORDER BY u.id
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/unions', async (req, res) => {
  const { union_name } = req.body;
  if (!union_name) return res.status(400).json({ error: 'Union name is required.' });
  try {
    const [result] = await db.execute('INSERT INTO unions (union_name) VALUES (?)', [union_name]);
    res.status(201).json({ id: result.insertId, message: 'Union council added.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/unions/:id', async (req, res) => {
  const { union_name } = req.body;
  if (!union_name) return res.status(400).json({ error: 'Union name is required.' });
  try {
    await db.execute('UPDATE unions SET union_name = ? WHERE id = ?', [union_name, req.params.id]);
    res.json({ message: 'Union council updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/unions/:id', async (req, res) => {
  try {
    const [[{ cnt }]] = await db.execute('SELECT COUNT(*) AS cnt FROM votes WHERE union_id = ?', [req.params.id]);
    if (cnt > 0) return res.status(400).json({ error: `Cannot delete — this union has ${cnt} votes recorded.` });
    await db.execute('DELETE FROM voters WHERE union_id = ?', [req.params.id]);
    await db.execute('DELETE FROM unions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Union council deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/votes', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const [rows] = await db.execute(`
      SELECT vt.id, vr.name AS voter_name, vr.mobile, vr.email,
             vr.village, u.union_name, c.name AS candidate_name, c.party_name,
             vt.vote_time
      FROM   votes vt
      JOIN   voters    vr ON vr.id = vt.voter_id
      JOIN   candidates c ON c.id  = vt.candidate_id
      JOIN   unions     u ON u.id  = vt.union_id
      ORDER  BY vt.vote_time DESC
      LIMIT  ? OFFSET ?
    `, [limit, offset]);
    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM votes');
    res.json({ votes: rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/votes/:id', async (req, res) => {
  try {
    const [[vote]] = await db.execute('SELECT voter_id FROM votes WHERE id = ?', [req.params.id]);
    if (!vote) return res.status(404).json({ error: 'Vote record not found.' });
    await db.execute('DELETE FROM votes WHERE id = ?', [req.params.id]);
    if (vote.voter_id) await db.execute('DELETE FROM voters WHERE id = ?', [vote.voter_id]);
    await db.execute("INSERT INTO activity_logs (action, details) VALUES ('VOTE_DELETED', ?)", [`Deleted vote record ID ${req.params.id}`]);
    res.json({ message: 'Participant record deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export/csv', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT vt.id, vr.name, vr.mobile, u.union_name,
             c.name AS candidate, c.party_name AS party, vt.vote_time
      FROM   votes vt
      JOIN   voters    vr ON vr.id = vt.voter_id
      JOIN   candidates c ON c.id  = vt.candidate_id
      JOIN   unions     u ON u.id  = vt.union_id
      ORDER  BY vt.vote_time DESC
    `);
    let csv = 'ID,Voter Name,Mobile,Union Council,Candidate,Party,Vote Time\n';
    rows.forEach(r => { csv += `${r.id},"${r.name}","${r.mobile}","${r.union_name}","${r.candidate}","${r.party}","${r.vote_time}"\n`; });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="votes_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both current and new password required.' });
  try {
    const [rows] = await db.execute('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.execute('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hash, req.admin.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
