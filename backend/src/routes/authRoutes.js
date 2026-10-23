const express = require('express');
const crypto = require('node:crypto');
const db = require('../database/connection');
const { generateSessionToken, authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordHash = hashPassword(password);
  if (user.password_hash !== passwordHash) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = generateSessionToken(user);
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
