const db = require('../../database/connection');

/**
 * Conector de WhatsApp Pessoal (Conformidade Regulatória e Auditoria de Riscos).
 * Declara explicitamente a indisponibilidade de API oficial pela Meta para números pessoais.
 */
class WhatsAppPersonalStubConnector {
  getStatus() {
    return {
      available: false,
      status: 'UNAVAILABLE_OFFICIAL',
      reason: 'A Meta Platforms Inc. não disponibiliza API oficial para WhatsApp Pessoal (WhatsApp Messenger).',
      legal_risk: 'O uso de bibliotecas de emulação/scraping (ex.: Baileys, WPPConnect, Puppeteer) viola a Seção 4b e Seção 5 dos Termos de Serviço da Meta e resulta em BANIMENTO PERMANENTE do número comercial da empresa.',
      recommendation: 'Utilizar o conector com Coexistência no WhatsApp Business ou a funcionalidade de Entrada Assistida/Upload Manual para preservar os números da empresa.'
    };
  }

  /**
   * Registra uma entrada assistida de mensagem recebida em WhatsApp Pessoal sem violar os termos da Meta.
   */
  registerAssistedMessage({ channelId = 'chan_wa_personal', senderPhone, senderName, text, employeeUserId }) {
    const crypto = require('node:crypto');
    const messageId = `msg_pers_${crypto.randomBytes(6).toString('hex')}`;
    const timestamp = new Date().toISOString();

    let client = db.get('SELECT id FROM clients WHERE phone = ?', [senderPhone]);
    if (!client) {
      const newClientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
      db.run('INSERT INTO clients (id, name, phone) VALUES (?, ?, ?)', [newClientId, senderName || `Cliente WhatsApp (${senderPhone})`, senderPhone]);
      client = { id: newClientId };
    }

    const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
    const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
    const orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

    db.transaction(() => {
      db.run(`
        INSERT INTO messages (id, channel_id, sender_id, sender_name, direction, content_type, raw_text, received_at)
        VALUES (?, ?, ?, ?, 'INBOUND', 'TEXT', ?, ?)
      `, [messageId, channelId, senderPhone, senderName, text, timestamp]);

      db.run(`
        INSERT INTO orders (id, order_code, client_id, message_id, channel_id, entry_method, status, original_text, review_notes)
        VALUES (?, ?, ?, ?, ?, 'MANUAL_ENTRY', 'PROCESSING', ?, 'Entrada assistida a partir de WhatsApp Pessoal pelo operador.')
      `, [orderId, orderCode, client.id, messageId, channelId, text]);

      // Registra trilha de auditoria
      db.run(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values)
        VALUES (?, ?, 'ASSISTED_PERSONAL_WA_INGESTION', 'ORDER', ?, ?)
      `, [`log_${crypto.randomBytes(6).toString('hex')}`, employeeUserId || 'usr_vendedor', orderId, JSON.stringify({ senderPhone, senderName, text })]);
    });

    const taskQueue = require('../queue/taskQueue');
    taskQueue.enqueue({
      entityType: 'ORDER',
      entityId: orderId,
      taskType: 'AI_EXTRACTION',
      payload: { orderId, orderCode, messageId, text, origin: 'MANUAL_ENTRY' }
    });

    return { order_id: orderId, order_code: orderCode, message_id: messageId };
  }
}

module.exports = new WhatsAppPersonalStubConnector();
