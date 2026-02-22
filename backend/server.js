/**
 * ============================================================
 *  NearHelp — Node.js / Express Backend
 *  Drop this folder into VS Code and run:  npm install && npm start
 *  Requires: Node.js 18+
 * ============================================================
 *
 *  Stack:
 *    - Express 4        → REST API server
 *    - SQLite3          → lightweight local database (no setup needed)
 *    - bcryptjs         → password hashing
 *    - jsonwebtoken     → auth tokens (JWT)
 *    - multer           → profile picture uploads
 *    - cors             → allow frontend to call API
 *    - dotenv           → environment variables
 *    - express-validator→ input validation
 *    - socket.io        → real-time chat & notifications
 *
 *  API Base URL:  http://localhost:3000/api
 * ============================================================
 */

require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');

// ── Route imports ──────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const itemRoutes     = require('./routes/items');
const requestRoutes  = require('./routes/requests');
const serviceRoutes  = require('./routes/services');
const driverRoutes   = require('./routes/drivers');
const chatRoutes     = require('./routes/chat');
const reviewRoutes   = require('./routes/reviews');
const rewardRoutes   = require('./routes/rewards');
const notifRoutes    = require('./routes/notifications');
const emergencyRoutes= require('./routes/emergency');

// ── DB bootstrap ───────────────────────────────────────────
const { initDB } = require('./db/database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ensure upload directory exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/items',         itemRoutes);
app.use('/api/requests',      requestRoutes);
app.use('/api/services',      serviceRoutes);
app.use('/api/drivers',       driverRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/reviews',       reviewRoutes);
app.use('/api/rewards',       rewardRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/emergency',     emergencyRoutes);

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'NearHelp API', version: '1.0.0' });
});

// ── 404 catch-all ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Socket.IO – real-time chat & notifications ─────────────
const onlineUsers = {};  // userId → socketId

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('user:online', (userId) => {
    onlineUsers[userId] = socket.id;
    io.emit('users:online', Object.keys(onlineUsers));
  });

  socket.on('chat:send', (data) => {
    // data: { senderId, receiverId, message, timestamp }
    const receiverSocket = onlineUsers[data.receiverId];
    if (receiverSocket) {
      io.to(receiverSocket).emit('chat:receive', data);
    }
  });

  socket.on('emergency:alert', (data) => {
    // Broadcast to all nearby users (simplified — filter by location in production)
    socket.broadcast.emit('emergency:incoming', data);
  });

  socket.on('request:new', (data) => {
    const targetSocket = onlineUsers[data.targetUserId];
    if (targetSocket) {
      io.to(targetSocket).emit('request:notify', data);
    }
  });

  socket.on('disconnect', () => {
    for (const uid in onlineUsers) {
      if (onlineUsers[uid] === socket.id) delete onlineUsers[uid];
    }
    io.emit('users:online', Object.keys(onlineUsers));
  });
});

// ── Boot ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB(() => {
  server.listen(PORT, () => {
    console.log(`\n🌿 NearHelp API running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO enabled on ws://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);
  });
});
