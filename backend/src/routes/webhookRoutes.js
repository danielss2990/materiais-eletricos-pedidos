const express = require('express');
const whatsappConnector = require('../services/connectors/whatsappCloudApi');
const emailConnector = require('../services/connectors/emailConnector');

const router = express.Router();

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
router.post('/email', async (req, res) => {
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

// POST /api/webhooks/n8n/whatsapp - Recebe mensagens do WhatsApp encaminhadas pelo n8n
// Aceita o payload original da Meta (com "entry") ou o formato simplificado
// { externalId, senderPhone, senderName, messageType, text, timestamp, mediaId, mimeType }.
router.post('/n8n/whatsapp', async (req, res) => {
  if (!whatsappConnector.verifyN8nSecret(req.headers['x-webhook-secret'])) {
    console.warn('[Webhook n8n] Cabeçalho X-Webhook-Secret ausente ou inválido.');
    return res.status(401).json({ error: 'Segredo do webhook n8n inválido.' });
  }

  try {
    const result = await whatsappConnector.processN8nPayload(req.body || {});
    return res.status(result.httpStatus || 200).json(result.body);
  } catch (err) {
    console.error('[Webhook n8n] Erro ao processar payload:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
