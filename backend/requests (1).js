/**
 * NearHelp — Requests Routes
 * GET    /api/requests/incoming
 * GET    /api/requests/outgoing
 * POST   /api/requests
 * PUT    /api/requests/:id/respond   { status: accepted|declined }
 * PUT    /api/requests/:id/complete
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');
const auth    = require('../middleware/auth');

router.get('/incoming', auth, (req, res) => {
  getDB().all(`
    SELECT r.*, u.name as requester_name, u.profile_pic as requester_pic
    FROM requests r
    JOIN users u ON u.id = r.requester_id
    WHERE r.target_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ requests: rows });
  });
});

router.get('/outgoing', auth, (req, res) => {
  getDB().all(`
    SELECT r.*, u.name as target_name, u.profile_pic as target_pic
    FROM requests r
    LEFT JOIN users u ON u.id = r.target_id
    WHERE r.requester_id = ?
    ORDER BY r.created_at DESC
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ requests: rows });
  });
});

router.post('/', auth, (req, res) => {
  const { target_id, item_id, service_id, type, message, scheduled_at } = req.body;
  if (!type) return res.status(400).json({ error: 'Request type required' });
  const db = getDB();
  db.run(`
    INSERT INTO requests (requester_id, target_id, item_id, service_id, type, message, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [req.user.id, target_id||null, item_id||null, service_id||null, type, message||'', scheduled_at||null],
  function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (target_id) {
      db.run(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'request', ?, ?)`,
        [target_id, `New ${type} request`, `${req.user.name} sent you a ${type} request`]);
    }
    res.status(201).json({ message: 'Request sent!', requestId: this.lastID });
  });
});

router.put('/:id/respond', auth, (req, res) => {
  const { status } = req.body;
  if (!['accepted','declined'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const db = getDB();
  db.run(`UPDATE requests SET status=? WHERE id=? AND target_id=?`,
    [status, req.params.id, req.user.id], function(err) {
      if (this.changes === 0) return res.status(403).json({ error: 'Not authorized' });
      if (status === 'accepted') {
        // reward for helping
        db.run(`INSERT INTO rewards (user_id, action, points, description) VALUES (?, 'help_given', 20, 'Accepted a help request')`, [req.user.id]);
        db.run(`UPDATE users SET near_points = near_points + 20 WHERE id = ?`, [req.user.id]);
        // notify requester
        db.get(`SELECT requester_id FROM requests WHERE id=?`, [req.params.id], (e, r) => {
          if (r) db.run(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'request', 'Request Accepted! 🎉', ?)`,
            [r.requester_id, `${req.user.name} accepted your request`]);
        });
      }
      res.json({ message: `Request ${status}` });
    });
});

router.put('/:id/complete', auth, (req, res) => {
  getDB().run(`UPDATE requests SET status='completed' WHERE id=? AND (requester_id=? OR target_id=?)`,
    [req.params.id, req.user.id, req.user.id], function(err) {
      if (this.changes === 0) return res.status(403).json({ error: 'Not authorized' });
      res.json({ message: 'Request marked as completed' });
    });
});

module.exports = router;
