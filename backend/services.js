/**
 * NearHelp — Services Routes
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');
const auth    = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const { type } = req.query;
  let q = `SELECT s.*, u.name as provider_name, u.profile_pic, u.rating_avg, u.status as provider_status, u.city FROM services s JOIN users u ON u.id = s.provider_id WHERE s.status='active' AND s.provider_id != ?`;
  const p = [req.user.id];
  if (type) { q += ` AND s.type = ?`; p.push(type); }
  q += ` ORDER BY s.created_at DESC LIMIT 100`;
  getDB().all(q, p, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ services: rows });
  });
});

router.post('/', auth, (req, res) => {
  const { type, title, description, availability, is_paid, price, radius_km } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'type and title required' });
  getDB().get(`SELECT latitude, longitude FROM users WHERE id=?`, [req.user.id], (err, u) => {
    getDB().run(`INSERT INTO services (provider_id, type, title, description, availability, is_paid, price, latitude, longitude, radius_km) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, type, title, description||'', availability||'', is_paid||0, price||0, u?.latitude||0, u?.longitude||0, radius_km||2],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        getDB().run(`INSERT INTO rewards (user_id, action, points, description) VALUES (?, 'service_listed', 15, 'Listed a service')`, [req.user.id]);
        getDB().run(`UPDATE users SET near_points = near_points + 15 WHERE id = ?`, [req.user.id]);
        res.status(201).json({ message: 'Service posted!', serviceId: this.lastID });
      });
  });
});

router.put('/:id', auth, (req, res) => {
  const { title, description, availability, status } = req.body;
  getDB().run(`UPDATE services SET title=COALESCE(?,title), description=COALESCE(?,description), availability=COALESCE(?,availability), status=COALESCE(?,status) WHERE id=? AND provider_id=?`,
    [title, description, availability, status, req.params.id, req.user.id], function(err) {
      if (this.changes === 0) return res.status(403).json({ error: 'Not found or unauthorized' });
      res.json({ message: 'Service updated' });
    });
});

router.delete('/:id', auth, (req, res) => {
  getDB().run(`DELETE FROM services WHERE id=? AND provider_id=?`, [req.params.id, req.user.id], function(err) {
    if (this.changes === 0) return res.status(403).json({ error: 'Not found or unauthorized' });
    res.json({ message: 'Service removed' });
  });
});

module.exports = router;
