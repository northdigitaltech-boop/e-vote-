const router = require('express').Router();
const db     = require('./db');

// GET /api/unions — all unions with total votes and leading candidate
router.get('/', async (req, res) => {
  try {
    const [unions] = await db.execute('SELECT * FROM unions ORDER BY id');
    const result   = [];

    for (const u of unions) {
      const [candRows] = await db.execute(`
        SELECT c.id, c.name, c.party_name, c.symbol,
               COUNT(v.id) AS vote_count
        FROM   candidates c
        LEFT JOIN votes v ON v.candidate_id = c.id AND v.union_id = ?
        WHERE  c.active = 1
        GROUP  BY c.id
        ORDER  BY vote_count DESC
      `, [u.id]);

      const [totRow] = await db.execute(
        'SELECT COUNT(*) AS total FROM votes WHERE union_id = ?',
        [u.id]
      );

      const [villages] = await db.execute(`
        SELECT vr.village, COUNT(v.id) AS vote_count
        FROM   votes v
        JOIN   voters vr ON vr.id = v.voter_id
        WHERE  v.union_id = ? AND vr.village IS NOT NULL AND vr.village != ''
        GROUP  BY vr.village
        ORDER  BY vote_count DESC
      `, [u.id]);

      result.push({
        ...u,
        total_votes: totRow[0].total,
        candidates:  candRows,
        leader:      candRows[0] || null,
        villages,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
