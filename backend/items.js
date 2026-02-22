/**
 * NearHelp — Items Routes
 * GET    /api/items            nearby items
 * POST   /api/items            create listing
 * GET    /api/items/:id
 * PUT    /api/items/:id
 * DELETE /api/items/:id
 */
const express  = require('express');
const router   = express.Router();
const { getDB } = require('../db/database');
const auth     = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const { lat, lng, radius = 2, category } = req.query;
  let query = `
    SELECT i.*, u.name as owner_name, u.profile_pic, u.rating_avg,
      u.city, u.status as owner_status
    FROM items i
    JOIN users u ON u.id = i.owner_id
    WHERE i.status = 'available' AND i.owner_id != ?
  `;
  const params = [req.user.id];
  if (category) { query += ` AND i.category = ?`; params.push(category); }
  query += ` ORDER BY i.created_at DESC LIMIT 100`;
  getDB().all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows, count: rows.length });
  });
});

router.post('/', auth, (req, res) => {
  const { title, description, category, condition, duration, deposit, image_url, radius_km } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  getDB().get(`SELECT latitude, longitude FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    getDB().run(`
      INSERT INTO items (owner_id, title, description, category, condition, duration, deposit, image_url, latitude, longitude, radius_km)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, title, description, category||'utility', condition||'good', duration||'flexible',
        deposit||0, image_url||'', user?.latitude||0, user?.longitude||0, radius_km||2],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      // reward for listing
      getDB().run(`INSERT INTO rewards (user_id, action, points, description) VALUES (?, 'item_listed', 10, 'Listed an item for lending')`, [req.user.id]);
      getDB().run(`UPDATE users SET near_points = near_points + 10 WHERE id = ?`, [req.user.id]);
      res.status(201).json({ message: 'Item listed!', itemId: this.lastID });
    });
  });
});

router.get('/:id', auth, (req, res) => {
  getDB().get(`SELECT i.*, u.name as owner_name, u.profile_pic, u.phone, u.rating_avg FROM items i JOIN users u ON u.id = i.owner_id WHERE i.id = ?`, [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: row });
  });
});

router.put('/:id', auth, (req, res) => {
  const { title, description, condition, duration, deposit, status } = req.body;
  getDB().run(`UPDATE items SET title=COALESCE(?,title), description=COALESCE(?,description), condition=COALESCE(?,condition), duration=COALESCE(?,duration), deposit=COALESCE(?,deposit), status=COALESCE(?,status) WHERE id=? AND owner_id=?`,
    [title, description, condition, duration, deposit, status, req.params.id, req.user.id], function(err) {
    if (err || this.changes === 0) return res.status(403).json({ error: 'Not found or not authorized' });
    res.json({ message: 'Item updated' });
  });
});

router.delete('/:id', auth, (req, res) => {
  getDB().run(`DELETE FROM items WHERE id=? AND owner_id=?`, [req.params.id, req.user.id], function(err) {
    if (this.changes === 0) return res.status(403).json({ error: 'Not found or not authorized' });
    res.json({ message: 'Item removed' });
  });
});

module.exports = router;
