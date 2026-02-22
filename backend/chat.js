/**
 * NearHelp — Chat Routes
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db/database');
const auth    = require('../middleware/auth');

// GET conversation history with a user
router.get('/:userId', auth, (req, res) => {
  const other = req.params.userId;
  getDB().all(`
    SELECT m.*, 
      su.name as sender_name, su.profile_pic as sender_pic
    FROM messages m
    JOIN users su ON su.id = m.sender_id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.created_at ASC LIMIT 200
  `, [req.user.id, other, other, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // mark as read
    getDB().run(`UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=?`, [req.user.id, other]);
    res.json({ messages: rows });
  });
});

// POST send a message (also done via socket.io in real-time; this persists it)
router.post('/:userId', auth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  const db = getDB();
  db.run(`INSERT INTO messages (sender_id, receiver_id, content) VALUES (?,?,?)`,
    [req.user.id, req.params.userId, content.trim()], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'chat', '💬 New message', ?)`,
        [req.params.userId, `${req.user.name}: ${content.substring(0,60)}`]);
      res.status(201).json({ message: 'Sent', messageId: this.lastID });
    });
});

// GET list of conversations (inbox)
router.get('/', auth, (req, res) => {
  getDB().all(`
    SELECT 
      CASE WHEN m.sender_id=? THEN m.receiver_id ELSE m.sender_id END as other_user_id,
      u.name as other_name, u.profile_pic as other_pic,
      m.content as last_message, m.created_at as last_at,
      SUM(CASE WHEN m.receiver_id=? AND m.is_read=0 THEN 1 ELSE 0 END) as unread
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.sender_id=? THEN m.receiver_id ELSE m.sender_id END
    WHERE m.sender_id=? OR m.receiver_id=?
    GROUP BY other_user_id
    ORDER BY last_at DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ conversations: rows });
  });
});

module.exports = router;
