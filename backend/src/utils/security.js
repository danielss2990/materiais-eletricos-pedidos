const crypto = require('node:crypto');
const path = require('node:path');

const SCRYPT_KEYLEN = 64;

/**
 * Gera hash de senha com scrypt e salt aleatório no formato "scrypt$<salt>$<hash>".
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * Valida a senha contra o hash armazenado.
 * Aceita também o formato legado (SHA-256 sem salt) para permitir migração no próximo login.
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || typeof password !== 'string') return false;

  if (storedHash.startsWith('scrypt$')) {
    const [, salt, hash] = storedHash.split('$');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return safeEqual(candidate, hash);
  }

  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return safeEqual(legacy, storedHash);
}

function isLegacyHash(storedHash) {
  return Boolean(storedHash) && !storedHash.startsWith('scrypt$');
}

/**
 * Comparação de strings em tempo constante.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normaliza um nome de arquivo recebido de fontes externas, impedindo path traversal.
 */
function safeFilename(filename, fallback = 'anexo') {
  const base = path.basename(String(filename || '').replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

/**
 * Monta o caminho final dentro do diretório de anexos e garante que não escape dele.
 */
function resolveInside(baseDir, filename) {
  const resolvedBase = path.resolve(baseDir);
  const target = path.resolve(resolvedBase, filename);
  if (!target.startsWith(resolvedBase + path.sep)) {
    throw new Error('Nome de arquivo inválido.');
  }
  return target;
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  safeEqual,
  safeFilename,
  resolveInside
};
