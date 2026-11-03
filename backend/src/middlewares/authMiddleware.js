const crypto = require('node:crypto');

// Mapa de tokens em memória para sessões ativas
const activeSessions = new Map();

const SESSION_COOKIE = 'sess_token';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

function generateSessionToken(user) {
  const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
  activeSessions.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    createdAt: Date.now()
  });
  return token;
}

function revokeSession(token) {
  if (token) activeSessions.delete(token);
}

function readCookie(req, name) {
  const header = req.headers['cookie'];
  if (!header) return null;
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

/**
 * Extrai o token da requisição: cabeçalho Authorization (Bearer) ou cookie de sessão.
 * O cookie permite que <img>, <audio> e links de download sejam autenticados.
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return readCookie(req, SESSION_COOKIE);
}

/**
 * Retorna a sessão válida associada à requisição, ou null.
 */
function getSession(req) {
  const token = extractToken(req);
  if (!token) return null;

  const session = activeSessions.get(token);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return null;
  }

  return session;
}

function authMiddleware(requiredRoles = []) {
  return (req, res, next) => {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Autenticação necessária ou sessão expirada.' });
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
  revokeSession,
  extractToken,
  getSession,
  activeSessions,
  SESSION_COOKIE,
  SESSION_TTL_MS
};
