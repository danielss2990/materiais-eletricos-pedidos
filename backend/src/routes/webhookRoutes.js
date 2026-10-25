const express = require('express');
const whatsappConnector = require('../services/connectors/whatsappCloudApi');
const emailConnector = require('../services/connectors/emailConnector');
const config = require('../config');
const { getSession } = require('../middlewares/authMiddleware');
const { safeEqual } = require('../utils/security');

const router = express.Router();

/**
 * Autenticação dos webhooks internos (e-mail e n8n): exige o cabeçalho X-Webhook-Token
 * igual a WEBHOOK_TOKEN, ou uma sessão de usuário válida (usada pela simulação no painel).
 */
function webhookAuth(req, res, next) {
  const provided = req.headers['x-webhook-token'];
  if (config.webhooks.token && provided && safeEqual(String(provided), config.webhooks.token)) {
    return next();
  }

  const session = getSession(req);
  if (session) {
    req.user = session;
    return next();
  }

  return res.status(401).json({ error: 'Webhook não autorizado: informe um X-Webhook-Token válido.' });
}

// ----------------------------------------------------------------------------
// WEBHOOK WHATSAPP CLOUD API (META BUSINESS PLATFORM)
// ----------------------------------------------------------------------------

// GET /api/webhooks/whatsapp - Handshake e verificação do Webhook da Meta
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifiedChallenge = whatsappConnector.verifyWebhook(mode, token, challenge);
  if (verifiedChallenge) {
    console.log('[Webhook Meta] Handshake validado com sucesso.');
    return res.status(200).send(verifiedChallenge);
  }

  console.warn('[Webhook Meta] Falha no handshake: token inválido.');
  return res.status(403).json({ error: 'Token de verificação inválido.' });
});

// POST /api/webhooks/whatsapp - Notificações de eventos e mensagens recebidas
router.post('/whatsapp', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // Validação criptográfica de assinatura Meta
  const isValidSignature = whatsappConnector.verifySignature(rawBody, signature);
  if (!isValidSignature) {
    console.warn('[Webhook Meta] Assinatura X-Hub-Signature-256 inválida.');
    return res.status(401).json({ error: 'Assinatura inválida.' });
  }

  try {
    const result = await whatsappConnector.handleWebhookPayload(req.body);
    // Meta exige resposta 200 OK rápida para não retransmitir webhooks
    return res.status(200).json({ status: 'SUCCESS', ...result });
  } catch (err) {
    console.error('[Webhook Meta] Erro ao processar payload:', err);
    // Retorna 200 para evitar flood de retentativas infinitas da Meta, mas registra o erro internamente
    return res.status(200).json({ status: 'ERROR_RECORDED', error: err.message });
  }
});

// ----------------------------------------------------------------------------
// WEBHOOK E-MAIL COMERCIAL (IMAP / SERVIÇO DE E-MAIL)
// ----------------------------------------------------------------------------

// POST /api/webhooks/email - Ingestão de mensagens de e-mail recebidas
router.post('/email', webhookAuth, async (req, res) => {
  const { messageId, from, fromName, to, subject, date, bodyText, attachments } = req.body;

  if (!from || (!bodyText && (!attachments || attachments.length === 0))) {
    return res.status(400).json({ error: 'Remetente (from) e corpo ou anexo são obrigatórios.' });
  }

  try {
    const result = await emailConnector.ingestEmail({
      messageId,
      from,
      fromName,
      to,
      subject,
      date,
      bodyText,
      attachments
    });

    return res.status(200).json({ status: 'SUCCESS', ...result });
  } catch (err) {
    console.error('[Webhook E-mail] Erro ao ingerir e-mail:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// WEBHOOK ORQUESTRADO VIA N8N (WHATSAPP BUSINESS)
// ----------------------------------------------------------------------------

// POST /api/webhooks/n8n/whatsapp - Recebe mensagens do WhatsApp processadas pelo n8n
router.post('/n8n/whatsapp', webhookAuth, async (req, res) => {
  const crypto = require('node:crypto');
  const db = require('../database/connection');
  const taskQueue = require('../services/queue/taskQueue');

  const {
    externalId: rawExtId,
    senderPhone,
    senderName,
    messageType = 'TEXT',
    text = '',
    timestamp: rawTimestamp,
    mediaId,
    mimeType
  } = req.body;

  if (!senderPhone && !text) {
    return res.status(400).json({ error: 'senderPhone ou text são obrigatórios no payload do n8n.' });
  }

  const externalId = rawExtId || `n8n_wa_${crypto.createHash('md5').update((senderPhone || '') + (text || '') + Date.now()).digest('hex')}`;

  // 1. Idempotência / Deduplicação
  const existing = db.get('SELECT id FROM messages WHERE external_id = ?', [externalId]);
  if (existing) {
    return res.status(200).json({ status: 'DUPLICATE_IGNORED', message: 'Mensagem já processada anteriormente.' });
  }

  const timestamp = rawTimestamp ? new Date(parseInt(rawTimestamp, 10) * 1000).toISOString() : new Date().toISOString();
  const messageDbId = `msg_n8n_${crypto.randomBytes(6).toString('hex')}`;

  let orderId = null;
  let orderCode = null;

  db.transaction(() => {
    // Atualiza canal com last_event_at
    db.run('UPDATE channels SET last_event_at = ?, last_sync_at = ? WHERE id = ?', [
      timestamp,
      new Date().toISOString(),
      'chan_wa_coex'
    ]);

    // Insere mensagem bruta
    db.run(`
      INSERT INTO messages (id, channel_id, external_id, sender_id, sender_name, direction, content_type, raw_payload, raw_text, received_at)
      VALUES (?, 'chan_wa_coex', ?, ?, ?, 'INBOUND', ?, ?, ?, ?)
    `, [
      messageDbId,
      externalId,
      senderPhone || 'WhatsApp Cliente',
      senderName || 'Cliente WhatsApp via n8n',
      messageType.toUpperCase(),
      JSON.stringify(req.body),
      text,
      timestamp
    ]);

    // Cria ou vincula cliente
    let client = db.get('SELECT id FROM clients WHERE phone = ?', [senderPhone]);
    if (!client) {
      const newClientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
      db.run('INSERT INTO clients (id, name, phone) VALUES (?, ?, ?)', [
        newClientId,
        senderName || `Cliente WhatsApp (${senderPhone})`,
        senderPhone
      ]);
      client = { id: newClientId };
    }

    // Cria Pedido
    orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
    orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

    db.run(`
      INSERT INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text, review_notes)
      VALUES (?, ?, ?, ?, 'chan_wa_coex', 'AUTOMATIC_WHATSAPP', 'PROCESSING', ?, ?)
    `, [
      orderId,
      orderCode,
      client.id,
      messageDbId,
      text,
      'Capturado via n8n Orchestrator (WhatsApp Business Cloud API).'
    ]);
  });

  // Enfileira tarefa assíncrona da IA
  taskQueue.enqueue({
    entityType: 'ORDER',
    entityId: orderId,
    taskType: 'AI_EXTRACTION',
    payload: {
      orderId,
      orderCode,
      messageId: messageDbId,
      text,
      origin: 'AUTOMATIC_WHATSAPP'
    }
  });

  return res.status(200).json({
    status: 'SUCCESS',
    orchestrator: 'n8n',
    order_id: orderId,
    order_code: orderCode,
    message: 'Mensagem do WhatsApp processada com sucesso via n8n e integrada ao sistema.'
  });
});

module.exports = router;
