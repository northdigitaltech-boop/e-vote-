const router  = require('express').Router();
const db      = require('./db');

// GET /api/candidates — all active candidates with vote counts
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT c.id, c.name, c.party_name, c.symbol, c.photo, c.description, c.active,
             COUNT(v.id) AS vote_count
      FROM   candidates c
      LEFT JOIN votes v ON v.candidate_id = c.id
      WHERE  c.active = 1
      GROUP  BY c.id
      ORDER  BY vote_count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/candidates/:id — single candidate
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM candidates WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Candidate not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
