const express = require('express');
const db = require('../database/connection');
const config = require('../config');
const {
  generateSessionToken,
  revokeSession,
  extractToken,
  authMiddleware,
  SESSION_COOKIE,
  SESSION_TTL_MS
} = require('../middlewares/authMiddleware');
const { hashPassword, verifyPassword, isLegacyHash } = require('../utils/security');

const router = express.Router();

function sessionCookie(value, maxAgeSec) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSec}`
  ];
  if (config.env === 'production') parts.push('Secure');
  return parts.join('; ');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  // Migra hashes legados (SHA-256 sem salt) para scrypt
  if (isLegacyHash(user.password_hash)) {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
  }

  const token = generateSessionToken(user);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  revokeSession(extractToken(req));
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  return res.json({ message: 'Sessão encerrada.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware(), (req, res) => {
  return res.json({ user: req.user });
});

// GET /api/auth/users
router.get('/users', authMiddleware(['ADMIN']), (req, res) => {
  const users = db.all('SELECT id, username, full_name, email, role, active, created_at FROM users');
  return res.json({ users });
});

module.exports = router;
