const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');
const db = require('../../database/connection');
const taskQueue = require('../queue/taskQueue');

/**
 * Conector oficial da WhatsApp Business Platform & Cloud API com Coexistência.
 */
class WhatsAppCloudApiConnector {
  /**
   * Validação de handshake do Webhook (GET).
   */
  verifyWebhook(mode, verifyToken, challenge) {
    if (mode === 'subscribe' && verifyToken === config.whatsapp.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Validação de assinatura criptográfica do payload (POST).
   * Meta envia no cabeçalho X-Hub-Signature-256: "sha256=<hash>"
   */
  verifySignature(rawBody, signatureHeader) {
    if (!config.whatsapp.appSecret) return true; // Se não configurado em dev, permite
    if (!signatureHeader) return false;

    const parts = signatureHeader.split('=');
    const signature = parts[1];
    if (!signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', config.whatsapp.appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Validação do segredo compartilhado enviado pelo n8n no cabeçalho X-Webhook-Secret.
   */
  verifyN8nSecret(secretHeader) {
    const expected = config.whatsapp.n8nWebhookSecret;
    if (!expected) return true; // Se não configurado em dev, permite
    if (!secretHeader) return false;

    const sigBuf = Buffer.from(String(secretHeader), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Converte o payload simplificado (externalId, senderPhone, text...) para o
   * formato de mensagem da Meta, reaproveitando o mesmo fluxo de processamento.
   */
  normalizedToMetaMessage(body) {
    const type = String(body.messageType || 'text').toLowerCase();
    const msg = {
      id: body.externalId || `n8n_wa_${crypto.randomBytes(8).toString('hex')}`,
      from: body.senderPhone || 'WhatsApp Cliente',
      timestamp: body.timestamp ? String(body.timestamp) : undefined,
      type
    };

    if (type === 'image') {
      msg.image = { id: body.mediaId, mime_type: body.mimeType, caption: body.text || '' };
    } else if (type === 'audio' || type === 'voice') {
      msg.type = 'audio';
      msg.audio = { id: body.mediaId, mime_type: body.mimeType };
    } else if (type === 'document') {
      msg.document = { id: body.mediaId, mime_type: body.mimeType, caption: body.text || '', filename: body.filename };
    } else {
      msg.type = 'text';
      msg.text = { body: body.text || '' };
    }

    const contacts = [{ wa_id: msg.from, profile: { name: body.senderName || null } }];
    return { msg, contacts };
  }

  /**
   * Baixa o binário de uma mídia da Cloud API (2 etapas: URL temporária e download).
   * Retorna null se o token não estiver configurado ou se o download falhar.
   */
  async downloadMedia(mediaId) {
    if (!mediaId || !config.whatsapp.apiToken) return null;

    const headers = { Authorization: `Bearer ${config.whatsapp.apiToken}` };
    try {
      const metaRes = await fetch(`https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${encodeURIComponent(mediaId)}`, {
        headers,
        signal: AbortSignal.timeout(10000)
      });
      if (!metaRes.ok) throw new Error(`Graph API retornou HTTP ${metaRes.status}`);
      const { url } = await metaRes.json();
      if (!url) throw new Error('Graph API não retornou a URL da mídia');

      const fileRes = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!fileRes.ok) throw new Error(`Download da mídia retornou HTTP ${fileRes.status}`);
      return Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      console.warn(`[WhatsApp Cloud API] Falha ao baixar mídia ${mediaId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Processamento de Webhook da Meta (POST).
   */
  async handleWebhookPayload(payload) {
    const results = [];
    if (!payload || !payload.entry) return { status: 'IGNORED', details: 'Payload sem entry' };

    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        // Ecos da Coexistência chegam no campo "smb_message_echoes"
        if (change.field !== 'messages' && change.field !== 'smb_message_echoes') continue;
        const val = change.value;
        if (!val) continue;

        // 1. Mensagens Recebidas de Clientes
        const incomingMessages = val.messages || [];
        for (const msg of incomingMessages) {
          const res = await this.processIncomingMessage(msg, val.metadata, val.contacts);
          results.push(res);
        }

        // 2. Mensagens Enviadas pelo Vendedor no Celular (Coexistência: smb_message_echoes)
        const echoedMessages = val.message_echoes || [];
        for (const echo of echoedMessages) {
          const res = await this.processEchoMessage(echo, val.metadata);
          results.push(res);
        }
      }
    }

    return { status: 'PROCESSED', events: results };
  }

  async processIncomingMessage(msg, metadata, contacts = [], options = {}) {
    const wamId = msg.id;
    const fromPhone = msg.from;
    const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
    const contactName = contacts.find(c => c.wa_id === fromPhone)?.profile?.name || null;

    // A. Deduplicação por wam_id (Idempotência)
    const existing = db.get('SELECT id FROM messages WHERE external_id = ?', [wamId]);
    if (existing) {
      return { action: 'DUPLICATE_IGNORED', wam_id: wamId };
    }

    const messageId = `msg_wa_${crypto.randomBytes(6).toString('hex')}`;
    let contentType = 'TEXT';
    let rawText = '';
    const attachmentsToSave = [];

    if (msg.type === 'text') {
      contentType = 'TEXT';
      rawText = msg.text?.body || '';
    } else if (msg.type === 'image') {
      contentType = 'IMAGE';
      rawText = msg.image?.caption || '';
      attachmentsToSave.push({
        id: msg.image.id,
        mimeType: msg.image.mime_type || 'image/jpeg',
        filename: `foto_pedido_${Date.now()}.jpg`,
        caption: msg.image.caption
      });
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      contentType = 'AUDIO';
      attachmentsToSave.push({
        id: msg.audio?.id || msg.voice?.id,
        mimeType: msg.audio?.mime_type || msg.voice?.mime_type || 'audio/ogg',
        filename: `audio_pedido_${Date.now()}.ogg`
      });
    } else if (msg.type === 'document') {
      contentType = 'DOCUMENT';
      rawText = msg.document?.caption || '';
      attachmentsToSave.push({
        id: msg.document.id,
        mimeType: msg.document.mime_type || 'application/pdf',
        filename: msg.document.filename || `documento_${Date.now()}.pdf`
      });
    }

    // B. Download das mídias pela Cloud API (fora da transação, pois é assíncrono)
    for (const att of attachmentsToSave) {
      att.content = await this.downloadMedia(att.id);
    }

    // C. Persistência Atômica da Mensagem Bruta
    let orderId = null;
    let orderCode = null;

    db.transaction(() => {
      // Atualiza canal com last_event_at
      db.run('UPDATE channels SET last_event_at = ?, last_sync_at = ? WHERE id = ?', [timestamp, new Date().toISOString(), 'chan_wa_coex']);

      // Insere mensagem bruta
      db.run(`
        INSERT INTO messages (id, channel_id, external_id, sender_id, sender_name, direction, content_type, raw_payload, raw_text, received_at)
        VALUES (?, 'chan_wa_coex', ?, ?, ?, 'INBOUND', ?, ?, ?, ?)
      `, [messageId, wamId, fromPhone, contactName, contentType, JSON.stringify(msg), rawText, timestamp]);

      // Cria ou vincula cliente
      let client = db.get('SELECT id FROM clients WHERE phone = ?', [fromPhone]);
      if (!client) {
        const newClientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
        db.run(`
          INSERT INTO clients (id, name, phone)
          VALUES (?, ?, ?)
        `, [newClientId, contactName || `Cliente WhatsApp (${fromPhone})`, fromPhone]);
        client = { id: newClientId };
      }

      // Cria pedido
      orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
      const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
      orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      db.run(`
        INSERT INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text, review_notes)
        VALUES (?, ?, ?, ?, 'chan_wa_coex', 'AUTOMATIC_WHATSAPP', 'PROCESSING', ?, ?)
      `, [orderId, orderCode, client.id, messageId, rawText, options.reviewNotes || null]);

      // Trata anexos
      for (const att of attachmentsToSave) {
        const attId = `att_${crypto.randomBytes(6).toString('hex')}`;
        const targetPath = path.join(config.storage.attachmentsDir, `${attId}_${att.filename}`);

        // Salva o binário baixado; sem token da Cloud API, guarda apenas a referência da mídia
        fs.writeFileSync(targetPath, att.content || `[Conteúdo binário de mídia Meta MediaId: ${att.id}]`);
        const hash = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');

        db.run(`
          INSERT INTO attachments (id, message_id, order_id, filename, file_path, mime_type, file_size_bytes, sha256_hash, processing_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STORED')
        `, [attId, messageId, orderId, att.filename, targetPath, att.mimeType, fs.statSync(targetPath).size, hash]);
      }
    });

    // D. Enfileira Tarefa Assíncrona de Processamento da IA
    taskQueue.enqueue({
      entityType: 'ORDER',
      entityId: orderId,
      taskType: 'AI_EXTRACTION',
      payload: { orderId, orderCode, messageId, text: rawText, origin: 'AUTOMATIC_WHATSAPP' }
    });

    return { action: 'ORDER_CREATED', order_id: orderId, order_code: orderCode, message_id: messageId };
  }

  /**
   * Processa o payload encaminhado pelo n8n (original da Meta ou simplificado).
   * Retorna { httpStatus?, body } para a rota HTTP.
   */
  async processN8nPayload(body) {
    // Payload original da Meta repassado pelo n8n: mensagens, ecos e mídias
    if (body.entry) {
      const result = await this.handleWebhookPayload(body);
      return { body: { status: 'SUCCESS', orchestrator: 'n8n', ...result } };
    }

    const { senderPhone, text, mediaId } = body;
    if (!senderPhone || (!text && !mediaId)) {
      return { httpStatus: 400, body: { error: 'senderPhone e text (ou mediaId) são obrigatórios no payload do n8n.' } };
    }

    const { msg, contacts } = this.normalizedToMetaMessage(body);
    const result = await this.processIncomingMessage(msg, null, contacts, {
      reviewNotes: 'Capturado via n8n Orchestrator (WhatsApp Business Cloud API).'
    });

    if (result.action === 'DUPLICATE_IGNORED') {
      return { body: { status: 'DUPLICATE_IGNORED', message: 'Mensagem já processada anteriormente.' } };
    }

    return {
      body: {
        status: 'SUCCESS',
        orchestrator: 'n8n',
        order_id: result.order_id,
        order_code: result.order_code,
        message: 'Mensagem do WhatsApp processada com sucesso via n8n e integrada ao sistema.'
      }
    };
  }

  async processEchoMessage(echo, metadata) {
    const echoId = echo.id;
    const recipient = echo.to;
    const timestamp = echo.timestamp ? new Date(parseInt(echo.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

    const existing = db.get('SELECT id FROM messages WHERE external_id = ?', [echoId]);
    if (existing) return { action: 'DUPLICATE_ECHO_IGNORED', id: echoId };

    const messageId = `msg_echo_${crypto.randomBytes(6).toString('hex')}`;
    const text = echo.text?.body || '[Mídia enviada pelo funcionário]';

    db.run(`
      INSERT INTO messages (id, channel_id, external_id, sender_id, recipient_id, direction, content_type, raw_payload, raw_text, received_at)
      VALUES (?, 'chan_wa_coex', ?, 'FUNCIONARIO_CELULAR', ?, 'OUTBOUND', 'TEXT', ?, ?, ?)
    `, [messageId, echoId, recipient, JSON.stringify(echo), text, timestamp]);

    return { action: 'ECHO_RECORDED', message_id: messageId, recipient };
  }
}

module.exports = new WhatsAppCloudApiConnector();
