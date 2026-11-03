const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('../config');

// Garante que o diretório de anexos exista
if (!fs.existsSync(config.storage.attachmentsDir)) {
  fs.mkdirSync(config.storage.attachmentsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.storage.attachmentsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const ALLOWED_MIME_TYPES = new Set([
  // Imagens
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  // Documentos
  'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/plain',
  // Áudios
  'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/aac'
]);

function fileFilter(req, file, cb) {
  const mime = file.mimetype.toLowerCase();
  // image/* genérico não é aceito: SVG pode conter scripts
  if (ALLOWED_MIME_TYPES.has(mime) || mime.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}. Formatos aceitos: imagens, PDFs, planilhas e áudios.`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxSizeMB * 1024 * 1024
  }
});

module.exports = upload;
