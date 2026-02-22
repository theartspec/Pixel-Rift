/**
 * NearHelp — Users Routes
 * GET    /api/users/me
 * PUT    /api/users/me
 * PUT    /api/users/me/status
 * PUT    /api/users/me/location
 * PUT    /api/users/me/preferences
 * POST   /api/users/me/profile-pic
 * GET    /api/users/nearby
 * GET    /api/users/:id
 * POST   /api/users/:id/follow
 * DELETE /api/users/me
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const { getDB } = require('../db/database');
const auth     = require('../middleware/auth');

const router = express.Router();

// multer setup for profile pictures
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `pfp_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },     // 3 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

function sanitizeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return safe;
}

// ── GET /api/users/me ──────────────────────────────────────
router.get('/me', auth, (req, res) => {
  getDB().get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(row) });
  });
});

// ── PUT /api/users/me — update profile ────────────────────
router.put('/me', auth, (req, res) => {
  const {
    name, bio, interests, skills, address, pincode, city,
    phone, profile_theme, dark_mode, elderly_mode, age_group, user_type
  } = req.body;
  const db = getDB();
  db.run(`
    UPDATE users SET
      name = COALESCE(?, name),
      bio  = COALESCE(?, bio),
      interests    = COALESCE(?, interests),
      skills       = COALESCE(?, skills),
      address      = COALESCE(?, address),
      pincode      = COALESCE(?, pincode),
      city         = COALESCE(?, city),
      phone        = COALESCE(?, phone),
      profile_theme= COALESCE(?, profile_theme),
      dark_mode    = COALESCE(?, dark_mode),
      elderly_mode = COALESCE(?, elderly_mode),
      age_group    = COALESCE(?, age_group),
      user_type    = COALESCE(?, user_type)
    WHERE id = ?
  `, [
    name, bio,
    interests ? JSON.stringify(interests) : null,
    skills    ? JSON.stringify(skills)    : null,
    address, pincode, city, phone,
    profile_theme, dark_mode, elderly_mode, age_group, user_type,
    req.user.id
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (e, row) => {
      res.json({ message: 'Profile updated', user: sanitizeUser(row) });
    });
  });
});

// ── PUT /api/users/me/status ───────────────────────────────
router.put('/me/status', auth, (req, res) => {
  const { status } = req.body;  // available | unavailable | at-work
  const allowed = ['available','unavailable','at-work'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  getDB().run(`UPDATE users SET status = ? WHERE id = ?`, [status, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated', status });
  });
});

// ── PUT /api/users/me/location ─────────────────────────────
router.put('/me/location', auth, (req, res) => {
  const { latitude, longitude, city, address } = req.body;
  getDB().run(`
    UPDATE users SET latitude = ?, longitude = ?,
      city    = COALESCE(?, city),
      address = COALESCE(?, address)
    WHERE id = ?
  `, [latitude, longitude, city, address, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Location updated', latitude, longitude });
  });
});

// ── PUT /api/users/me/preferences ─────────────────────────
router.put('/me/preferences', auth, (req, res) => {
  const { dark_mode, elderly_mode, profile_theme } = req.body;
  getDB().run(`
    UPDATE users SET dark_mode = COALESCE(?, dark_mode),
      elderly_mode  = COALESCE(?, elderly_mode),
      profile_theme = COALESCE(?, profile_theme)
    WHERE id = ?
  `, [dark_mode, elderly_mode, profile_theme, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Preferences saved' });
  });
});

// ── POST /api/users/me/profile-pic (emoji or file) ────────
router.post('/me/profile-pic', auth, upload.single('pic'), (req, res) => {
  let picValue;
  if (req.file) {
    picValue = `/uploads/${req.file.filename}`;
  } else if (req.body.emoji) {
    picValue = req.body.emoji;
  } else {
    return res.status(400).json({ error: 'Provide emoji or image file' });
  }
  getDB().run(`UPDATE users SET profile_pic = ? WHERE id = ?`, [picValue, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profile picture updated', profile_pic: picValue });
  });
});

// ── GET /api/users/nearby?lat=&lng=&radius=2 ──────────────
router.get('/nearby', auth, (req, res) => {
  const { lat, lng, radius = 2 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  // Haversine formula in SQLite (approximation)
  const R     = 6371;
  const latRad = parseFloat(lat) * Math.PI / 180;
  getDB().all(`
    SELECT id, name, profile_pic, status, user_type, rating_avg, city,
      (
        ${R} * acos(
          cos(${latRad}) * cos(latitude * 3.14159265 / 180) *
          cos((longitude - ${parseFloat(lng)}) * 3.14159265 / 180) +
          sin(${latRad}) * sin(latitude * 3.14159265 / 180)
        )
      ) AS distance_km
    FROM users
    WHERE id != ?
      AND latitude != 0 AND longitude != 0
      AND status != 'unavailable'
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `, [req.user.id, parseFloat(radius)], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ users: rows, count: rows.length });
  });
});

// ── GET /api/users/:id ─────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  getDB().get(`
    SELECT id, name, profile_pic, bio, status, rating_avg, rating_count,
      near_points, user_type, skills, city, created_at
    FROM users WHERE id = ?
  `, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ user: row });
  });
});

// ── POST /api/users/:id/follow — send follow request ──────
router.post('/:id/follow', auth, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  const db = getDB();
  db.run(`
    INSERT INTO requests (requester_id, target_id, type, message, status)
    VALUES (?, ?, 'follow', ?, 'pending')
  `, [req.user.id, req.params.id, req.body.message || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    // create notification for target user
    db.run(`
      INSERT INTO notifications (user_id, type, title, body)
      VALUES (?, 'request', 'New Follow Request', ?)
    `, [req.params.id, `${req.user.name} wants to follow your availability`]);
    res.status(201).json({ message: 'Follow request sent', requestId: this.lastID });
  });
});

module.exports = router;
