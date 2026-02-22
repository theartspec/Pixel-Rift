/**
 * NearHelp — Drivers Routes
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');
const auth    = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  getDB().all(`
    SELECT d.*, u.name, u.profile_pic, u.phone, u.city, u.rating_avg as user_rating
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE d.available = 1
    ORDER BY d.rating_avg DESC, d.trip_count DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ drivers: rows });
  });
});

router.post('/register', auth, (req, res) => {
  const { vehicle_type, experience_yrs, specialization } = req.body;
  getDB().run(`
    INSERT INTO drivers (user_id, vehicle_type, experience_yrs, specialization)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET vehicle_type=excluded.vehicle_type,
      experience_yrs=excluded.experience_yrs, specialization=excluded.specialization
  `, [req.user.id, vehicle_type||'car', experience_yrs||0, specialization||'general'],
  function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'Registered as driver!' });
  });
});

router.put('/availability', auth, (req, res) => {
  const { available } = req.body;
  getDB().run(`UPDATE drivers SET available=? WHERE user_id=?`, [available?1:0, req.user.id], function(err) {
    if (this.changes === 0) return res.status(404).json({ error: 'Driver profile not found' });
    res.json({ message: 'Availability updated', available });
  });
});

module.exports = router;
