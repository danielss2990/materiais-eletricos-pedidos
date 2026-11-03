const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');
const db = require('../../database/connection');
const taskQueue = require('../queue/taskQueue');
const { safeFilename, resolveInside } = require('../../utils/security');

/**
 * Conector de E-mail Comercial (IMAP / Webhook).
 */
class EmailConnector {
  /**
   * Processa uma mensagem de e-mail recebida com prevenção rigorosa de duplicidade (RFC 5322).
   */
  async ingestEmail({
    messageId: rawMessageId,
    from,
    fromName,
    to,
    subject,
    date,
    bodyText,
    attachments = []
  }) {
    // 1. Identificador unívoco do e-mail
    const externalId = rawMessageId || `<${crypto.createHash('md5').update((from || '') + (subject || '') + (date || '')).digest('hex')}@eletricabrasil.com.br>`;

    // 2. Prevenção de duplicidade por external_id
    const existing = db.get('SELECT id FROM messages WHERE external_id = ?', [externalId]);
    if (existing) {
      return { status: 'DUPLICATE_IGNORED', message_id: externalId };
    }

    const messageDbId = `msg_em_${crypto.randomBytes(6).toString('hex')}`;
    const receivedAt = date ? new Date(date).toISOString() : new Date().toISOString();
    const fullText = subject ? `Assunto: ${subject}\n\n${bodyText || ''}` : (bodyText || '');

    let orderId = null;
    let orderCode = null;

    db.transaction(() => {
      // Atualiza canal de e-mail
      db.run('UPDATE channels SET last_event_at = ?, last_sync_at = ? WHERE id = ?', [receivedAt, new Date().toISOString(), 'chan_email_pedidos']);

      // Insere mensagem bruta
      db.run(`
        INSERT INTO messages (id, channel_id, external_id, sender_id, sender_name, recipient_id, direction, content_type, raw_payload, raw_text, received_at)
        VALUES (?, 'chan_email_pedidos', ?, ?, ?, ?, 'INBOUND', ?, ?, ?, ?)
      `, [
        messageDbId,
        externalId,
        from || 'desconhecido@cliente.com',
        fromName || from,
        to || 'pedidos@eletricabrasil.com.br',
        attachments.length > 0 ? 'MIXED' : 'TEXT',
        JSON.stringify({ subject, from, to, date, externalId }),
        fullText,
        receivedAt
      ]);

      // Cria ou vincula cliente
      let client = db.get('SELECT id FROM clients WHERE email = ?', [from]);
      if (!client) {
        const newClientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
        db.run('INSERT INTO clients (id, name, email) VALUES (?, ?, ?)', [newClientId, fromName || from || 'Cliente E-mail', from]);
        client = { id: newClientId };
      }

      // Cria Pedido
      orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
      const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
      orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      db.run(`
        INSERT INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text)
        VALUES (?, ?, ?, ?, 'chan_email_pedidos', 'AUTOMATIC_EMAIL', 'PROCESSING', ?)
      `, [orderId, orderCode, client.id, messageDbId, fullText]);

      // Trata anexos
      for (const att of attachments) {
        const attId = `att_${crypto.randomBytes(6).toString('hex')}`;
        const filename = safeFilename(att.filename, `anexo_email_${Date.now()}`);
        const targetPath = resolveInside(config.storage.attachmentsDir, `${attId}_${filename}`);

        if (att.contentBuffer) {
          fs.writeFileSync(targetPath, att.contentBuffer);
        } else {
          fs.writeFileSync(targetPath, Buffer.from(att.base64Content || '', 'base64'));
        }

        const size = fs.statSync(targetPath).size;
        const hash = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');

        db.run(`
          INSERT INTO attachments (id, message_id, order_id, filename, file_path, mime_type, file_size_bytes, sha256_hash, processing_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STORED')
        `, [attId, messageDbId, orderId, filename, targetPath, att.mimeType || 'application/octet-stream', size, hash]);
      }
    });

    // Enfileira processamento
    taskQueue.enqueue({
      entityType: 'ORDER',
      entityId: orderId,
      taskType: 'AI_EXTRACTION',
      payload: { orderId, orderCode, messageId: messageDbId, text: fullText, origin: 'AUTOMATIC_EMAIL' }
    });

    return { status: 'CREATED', order_id: orderId, order_code: orderCode, message_id: externalId };
  }
}

module.exports = new EmailConnector();
