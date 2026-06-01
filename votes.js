const router = require('express').Router();
const db     = require('./db');

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// ── POST /api/votes/cast  →  cast vote directly (no OTP) ─────────────────────
router.post('/cast', async (req, res) => {
  const { name, mobile, email, union_id, village, candidate_id } = req.body;

  if (!name || !mobile || !union_id || !candidate_id) {
    return res.status(400).json({ error: 'Name, mobile, union council and candidate are required.' });
  }

  const ip = getClientIP(req);

  try {
    // 1. Check duplicate vote by mobile
    const [dup] = await db.execute('SELECT id FROM voters WHERE mobile = ?', [mobile.trim()]);
    if (dup.length) {
      return res.status(409).json({ error: 'This mobile number has already voted. Only one vote per mobile is allowed.' });
    }

    // 2. Validate candidate
    const [cand] = await db.execute('SELECT id FROM candidates WHERE id = ? AND active = 1', [candidate_id]);
    if (!cand.length) return res.status(400).json({ error: 'Invalid candidate selected.' });

    // 3. Validate union
    const [union] = await db.execute('SELECT id FROM unions WHERE id = ?', [union_id]);
    if (!union.length) return res.status(400).json({ error: 'Invalid union council selected.' });

    // 4. Record voter
    const [voterResult] = await db.execute(
      'INSERT INTO voters (name, mobile, email, union_id, village, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), mobile.trim(), email?.trim() || null, union_id, village?.trim() || null, ip]
    );
    const voterId = voterResult.insertId;

    // 5. Record vote
    await db.execute('INSERT INTO votes (voter_id, candidate_id, union_id) VALUES (?, ?, ?)', [voterId, candidate_id, union_id]);

    // 6. Log activity
    await db.execute(
      "INSERT INTO activity_logs (action, details, ip_address) VALUES ('VOTE_CAST', ?, ?)",
      [`Voter: ${name}, Mobile: ${mobile}, Village: ${village||'N/A'}, Candidate ID: ${candidate_id}, Union ID: ${union_id}`, ip]
    );

    res.json({ message: 'Vote cast successfully. Thank you for participating!' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This mobile number has already voted.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/votes/results  →  live results ───────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    const [candidates] = await db.execute(`
      SELECT c.id, c.name, c.party_name, c.symbol, c.photo,
             COUNT(v.id) AS vote_count
      FROM   candidates c
      LEFT JOIN votes v ON v.candidate_id = c.id
      WHERE  c.active = 1
      GROUP  BY c.id
      ORDER  BY vote_count DESC
    `);

    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM votes');
    const [unions] = await db.execute('SELECT * FROM unions ORDER BY id');
    const unionResults = [];

    for (const u of unions) {
      const [uCands] = await db.execute(`
        SELECT c.id, c.name, c.party_name,
               COUNT(v.id) AS vote_count
        FROM   candidates c
        LEFT JOIN votes v ON v.candidate_id = c.id AND v.union_id = ?
        WHERE  c.active = 1
        GROUP  BY c.id
        ORDER  BY vote_count DESC
      `, [u.id]);
      const [[uTot]] = await db.execute('SELECT COUNT(*) AS total FROM votes WHERE union_id = ?', [u.id]);

      const [villages] = await db.execute(`
        SELECT vr.village, COUNT(v.id) AS vote_count,
               (SELECT c.name FROM candidates c
                JOIN votes v2 ON v2.candidate_id = c.id
                JOIN voters vr2 ON vr2.id = v2.voter_id
                WHERE v2.union_id = ? AND vr2.village = vr.village
                GROUP BY v2.candidate_id ORDER BY COUNT(*) DESC LIMIT 1) AS leading_candidate,
               (SELECT c.party_name FROM candidates c
                JOIN votes v2 ON v2.candidate_id = c.id
                JOIN voters vr2 ON vr2.id = v2.voter_id
                WHERE v2.union_id = ? AND vr2.village = vr.village
                GROUP BY v2.candidate_id ORDER BY COUNT(*) DESC LIMIT 1) AS leading_party
        FROM   votes v
        JOIN   voters vr ON vr.id = v.voter_id
        WHERE  v.union_id = ? AND vr.village IS NOT NULL AND vr.village != ''
        GROUP  BY vr.village
        ORDER  BY vote_count DESC
      `, [u.id, u.id, u.id]);

      unionResults.push({ ...u, total_votes: uTot.total, candidates: uCands, villages });
    }

    const [trend] = await db.execute(`
      SELECT DATE(vote_time) AS day, COUNT(*) AS count
      FROM   votes
      WHERE  vote_time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP  BY DATE(vote_time)
      ORDER  BY day ASC
    `);

    res.json({ candidates, total, unions: unionResults, trend });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
