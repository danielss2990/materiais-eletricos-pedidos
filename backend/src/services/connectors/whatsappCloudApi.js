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
   * Processamento de Webhook da Meta (POST).
   */
  async handleWebhookPayload(payload) {
    const results = [];
    if (!payload || !payload.entry) return { status: 'IGNORED', details: 'Payload sem entry' };

    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
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

  async processIncomingMessage(msg, metadata, contacts = []) {
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

    // B. Persistência Atômica da Mensagem Bruta
    let orderId = null;
    let orderCode = null;

    db.transaction(() => {
      // Atualiza canal com last_event_at
      db.run('UPDATE channels SET last_event_at = ? WHERE id = ?', [timestamp, 'chan_wa_coex']);

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
        INSERT INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text)
        VALUES (?, ?, ?, ?, 'chan_wa_coex', 'AUTOMATIC_WHATSAPP', 'PROCESSING', ?)
      `, [orderId, orderCode, client.id, messageId, rawText]);

      // Trata anexos
      for (const att of attachmentsToSave) {
        const attId = `att_${crypto.randomBytes(6).toString('hex')}`;
        const targetPath = path.join(config.storage.attachmentsDir, `${attId}_${att.filename}`);

        // Salva mock/arquivo seguro
        fs.writeFileSync(targetPath, `[Conteúdo binário de mídia Meta MediaId: ${att.id}]`);
        const hash = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');

        db.run(`
          INSERT INTO attachments (id, message_id, order_id, filename, file_path, mime_type, file_size_bytes, sha256_hash, processing_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STORED')
        `, [attId, messageId, orderId, att.filename, targetPath, att.mimeType, fs.statSync(targetPath).size, hash]);
      }
    });

    // C. Enfileira Tarefa Assíncrona de Processamento da IA
    taskQueue.enqueue({
      entityType: 'ORDER',
      entityId: orderId,
      taskType: 'AI_EXTRACTION',
      payload: { orderId, orderCode, messageId, text: rawText, origin: 'AUTOMATIC_WHATSAPP' }
    });

    return { action: 'ORDER_CREATED', order_id: orderId, order_code: orderCode, message_id: messageId };
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
