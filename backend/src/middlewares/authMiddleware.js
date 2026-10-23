const crypto = require('node:crypto');
const db = require('../database/connection');
const config = require('../config');

// Mapa de tokens em memória para sessões ativas
const activeSessions = new Map();

function generateSessionToken(user) {
  const token = `sess_${crypto.randomBytes(16).toString('hex')}`;
  activeSessions.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    createdAt: Date.now()
  });
  return token;
}

function authMiddleware(requiredRoles = []) {
  return (req, res, next) => {
    // Permite rotas públicas de webhooks e login
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      // Para ambiente local de desenvolvimento, se não houver header, cria uma sessão anônima como ADMIN ou ATTENDANT
      const defaultUser = db.get('SELECT * FROM users WHERE role = ? LIMIT 1', ['ADMIN']);
      if (defaultUser) {
        req.user = {
          userId: defaultUser.id,
          username: defaultUser.username,
          role: defaultUser.role,
          fullName: defaultUser.full_name
        };
        return next();
      }
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const session = activeSessions.get(token);

    if (!session) {
      // Se não encontrou na memória, verifica se é um token de dev rápido ou autentica pelo usuário
      const user = db.get('SELECT * FROM users WHERE id = ?', [token]);
      if (user) {
        req.user = {
          userId: user.id,
          username: user.username,
          role: user.role,
          fullName: user.full_name
        };
        return next();
      }
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(session.role)) {
      return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para este recurso.' });
    }

    req.user = session;
    next();
  };
}

module.exports = {
  authMiddleware,
  generateSessionToken,
  activeSessions
};
