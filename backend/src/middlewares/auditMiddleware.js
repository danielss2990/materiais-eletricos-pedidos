const crypto = require('node:crypto');
const db = require('../database/connection');

function auditLog(action, entityType, entityId, oldValues = null, newValues = null, userId = null, req = null) {
  try {
    const id = `log_${crypto.randomBytes(6).toString('hex')}`;
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '127.0.0.1';
    const finalUserId = userId || (req && req.user ? req.user.userId : 'usr_system');

    db.run(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      finalUserId,
      action,
      entityType,
      entityId,
      oldValues ? (typeof oldValues === 'string' ? oldValues : JSON.stringify(oldValues)) : null,
      newValues ? (typeof newValues === 'string' ? newValues : JSON.stringify(newValues)) : null,
      ip
    ]);
  } catch (err) {
    console.error('[AuditLog] Erro ao gravar trilha de auditoria:', err.message);
  }
}

module.exports = {
  auditLog
};
