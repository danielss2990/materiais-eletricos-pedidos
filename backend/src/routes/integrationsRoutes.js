const express = require('express');
const db = require('../database/connection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const whatsappPersonalStub = require('../services/connectors/whatsappPersonalStub');

const router = express.Router();

// GET /api/integrations - Listagem do estado real de cada conector
router.get('/', authMiddleware(), (req, res) => {
  const channels = db.all('SELECT * FROM channels ORDER BY type ASC');

  const sanitizedChannels = channels.map(c => {
    let cfg = {};
    try {
      cfg = JSON.parse(c.config_json || '{}');
    } catch {
      cfg = {};
    }

    // NUNCA expõe segredos ou senhas
    delete cfg.password;
    delete cfg.app_secret;
    delete cfg.api_token;

    let limitationExplanation = null;
    if (c.type === 'WHATSAPP_PERSONAL') {
      limitationExplanation = 'A Meta Platforms não possui API oficial para contas pessoais. Scraping não é utilizado por violar os Termos de Serviço da Meta e causar risco de banimento definitivo do número telefônico.';
    } else if (c.type === 'WHATSAPP_BUSINESS') {
      limitationExplanation = 'Opera via Meta Cloud API com Coexistência ativa (WhatsApp Business app v2.24.17+ no celular do vendedor com webhook smb_message_echoes). O celular precisa abrir o app a cada 13 dias.';
    } else if (c.type === 'EMAIL') {
      limitationExplanation = 'Conectado a caixas comerciais via IMAP/TLS com deduplicação por RFC 5322 Message-ID e extração de anexos multiparts.';
    }

    return {
      id: c.id,
      type: c.type,
      name: c.name,
      identifier: c.identifier,
      status: c.status,
      config: cfg,
      last_event_at: c.last_event_at,
      last_sync_at: c.last_sync_at,
      error_details: c.error_details,
      limitation_explanation: limitationExplanation
    };
  });

  return res.json({ channels: sanitizedChannels });
});

// GET /api/integrations/events - Registro recente de eventos
router.get('/events', authMiddleware(), (req, res) => {
  const events = db.all(`
    SELECT m.id, m.external_id, m.sender_id, m.sender_name, m.direction, m.content_type, 
           m.received_at, ch.name as channel_name, ch.type as channel_type,
           o.order_code, o.status as order_status
    FROM messages m
    LEFT JOIN channels ch ON m.channel_id = ch.id
    LEFT JOIN orders o ON m.id = o.message_id
    ORDER BY m.received_at DESC
    LIMIT 50
  `);

  return res.json({ events });
});

// POST /api/integrations/whatsapp-personal/assist - Entrada assistida de WhatsApp Pessoal
router.post('/whatsapp-personal/assist', authMiddleware(), (req, res) => {
  const { senderPhone, senderName, text } = req.body;
  if (!senderPhone || !text) {
    return res.status(400).json({ error: 'Telefone do cliente e texto da mensagem são obrigatórios.' });
  }

  try {
    const result = whatsappPersonalStub.registerAssistedMessage({
      senderPhone,
      senderName,
      text,
      employeeUserId: req.user?.userId
    });

    return res.status(201).json({
      message: 'Mensagem do WhatsApp Pessoal registrada em modo assistido com conformidade legal.',
      ...result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
