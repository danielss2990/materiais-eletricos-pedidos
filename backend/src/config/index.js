const path = require('node:path');
const fs = require('node:fs');

// Carrega .env manualmente ou via dotenv se disponível
const rootDir = path.resolve(__dirname, '..', '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appSecret: process.env.APP_SECRET || 'segredo_padrao_desenvolvimento_2026',
  
  database: {
    driver: process.env.DATABASE_DRIVER || 'sqlite',
    sqlitePath: path.resolve(rootDir, process.env.SQLITE_DB_PATH || 'data/database.sqlite'),
  },

  storage: {
    attachmentsDir: path.resolve(rootDir, process.env.ATTACHMENT_STORAGE_DIR || 'storage/attachments'),
    maxSizeMB: parseInt(process.env.MAX_ATTACHMENT_SIZE_MB, 10) || 50
  },

  // Token compartilhado exigido no cabeçalho X-Webhook-Token pelos webhooks de e-mail e n8n.
  // Sem valor configurado, esses webhooks só aceitam chamadas de usuários autenticados.
  webhooks: {
    token: process.env.WEBHOOK_TOKEN || ''
  },

  // Sem valores padrão: segredos conhecidos publicamente permitiriam forjar webhooks da Meta.
  whatsapp: {
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiToken: process.env.WHATSAPP_API_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || ''
  },

  email: {
    host: process.env.EMAIL_IMAP_HOST || '',
    port: parseInt(process.env.EMAIL_IMAP_PORT, 10) || 993,
    user: process.env.EMAIL_IMAP_USER || '',
    password: process.env.EMAIL_IMAP_PASSWORD || '',
    checkIntervalSec: parseInt(process.env.EMAIL_CHECK_INTERVAL_SECONDS, 10) || 60
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'local_heuristic', // 'gemini' | 'openai' | 'local_heuristic'
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    modelName: process.env.AI_MODEL_NAME || 'gemini-1.5-flash',
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.1
  }
};

module.exports = config;
