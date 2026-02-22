/**
 * NearHelp — JWT Auth Middleware
 * Attach to any route that requires a logged-in user.
 * Usage: router.get('/protected', authMiddleware, handler)
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nearhelp_secret_key_change_in_prod';

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;   // { id, name, email, user_type }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = authMiddleware;
