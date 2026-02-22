/**
 * NearHelp — Emergency Routes
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');
const auth    = require('../middleware/auth');

router.post('/', auth, (req, res) => {
  const { latitude, longitude, message } = req.body;
  const db = getDB();
  db.run(`INSERT INTO emergency_alerts (user_id, latitude, longitude, message) VALUES (?,?,?,?)`,
    [req.user.id, latitude||0, longitude||0, message||'I need help!'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.all(`SELECT id FROM users WHERE user_type IN ('volunteer','provider') AND status='available' AND id != ?`, [req.user.id], (e, volunteers) => {
        volunteers.forEach(v => {
          db.run(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'emergency', '🆘 Emergency Alert!', ?)`,
            [v.id, `${req.user.name} needs immediate help nearby!`]);
        });
      });
      res.status(201).json({ message: 'Emergency alert sent to all nearby volunteers!', alertId: this.lastID });
    });
});

router.put('/:id/resolve', auth, (req, res) => {
  getDB().run(`UPDATE emergency_alerts SET resolved=1 WHERE id=? AND user_id=?`,
    [req.params.id, req.user.id], function(err) {
      if (this.changes === 0) return res.status(403).json({ error: 'Not authorized' });
      res.json({ message: 'Alert resolved. Stay safe! 🌿' });
    });
});

router.get('/history', auth, (req, res) => {
  getDB().all(`SELECT * FROM emergency_alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 20`,
    [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ alerts: rows });
    });
});

module.exports = router;
