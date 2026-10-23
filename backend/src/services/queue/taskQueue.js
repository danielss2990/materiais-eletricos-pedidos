const crypto = require('node:crypto');
const db = require('../../database/connection');

class TaskQueue {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * Adiciona uma tarefa à fila persistida no banco de dados.
   */
  enqueue({ entityType, entityId, taskType, payload }) {
    const taskId = `task_${crypto.randomBytes(6).toString('hex')}`;
    db.run(`
      INSERT INTO processing_tasks (id, entity_type, entity_id, task_type, status, attempts, max_attempts, payload)
      VALUES (?, ?, ?, ?, 'QUEUED', 0, 3, ?)
    `, [taskId, entityType, entityId, taskType, JSON.stringify(payload || {})]);

    // Dispara processador de forma assíncrona (não bloqueia a resposta do webhook)
    setImmediate(() => this.processNext());
    return taskId;
  }

  /**
   * Processa a próxima tarefa pendente na fila.
   */
  async processNext() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const task = db.get(`
        SELECT * FROM processing_tasks 
        WHERE status = 'QUEUED' AND attempts < max_attempts 
        ORDER BY created_at ASC LIMIT 1
      `);

      if (!task) {
        this.isProcessing = false;
        return;
      }

      // Marca como PROCESSING
      db.run('UPDATE processing_tasks SET status = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['PROCESSING', task.id]);

      let payload = {};
      try {
        payload = JSON.parse(task.payload || '{}');
      } catch {
        payload = {};
      }

      // Executa a tarefa conforme o tipo
      if (task.task_type === 'AI_EXTRACTION') {
        await this.handleAiExtraction(task, payload);
      }

      // Continua processando a fila enquanto houver tarefas
      this.isProcessing = false;
      this.processNext();
    } catch (err) {
      console.error('[TaskQueue] Erro ao processar fila:', err);
      this.isProcessing = false;
    }
  }

  async handleAiExtraction(task, payload) {
    const aiEngine = require('../ai/aiEngine');
    const { orderId, orderCode, messageId, text, origin } = payload;

    try {
      // Busca anexos vinculados a este pedido
      const attachments = db.all('SELECT * FROM attachments WHERE order_id = ?', [orderId]).map(a => ({
        filePath: a.file_path,
        mimeType: a.mime_type,
        filename: a.filename
      }));

      // Executa motor de IA
      const result = await aiEngine.processOrder({
        orderId: orderCode || orderId,
        messageOrigin: origin || 'MANUAL_ENTRY',
        text,
        attachments
      });

      // Salva os itens extraídos no banco em transação atômica
      db.transaction(() => {
        // Remove itens provisórios antigos se for reprocessamento
        db.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);

        for (const it of result.items) {
          const itemId = `item_${crypto.randomBytes(6).toString('hex')}`;
          db.run(`
            INSERT INTO order_items (
              id, order_id, original_text, normalized_name, quantity, unit,
              technical_specs, suggested_product_id, matched_product_id,
              confidence_score, needs_review, review_reason, missing_specs, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
          `, [
            itemId,
            orderId,
            it.original_text,
            it.normalized_name,
            it.quantity,
            it.unit,
            JSON.stringify(it.explicit_specs || {}),
            it.suggested_sku ? (db.get('SELECT id FROM products WHERE sku = ?', [it.suggested_sku])?.id || null) : null,
            it.matched_product_id || null,
            it.confidence_score,
            it.needs_review ? 1 : 0,
            it.review_reason,
            JSON.stringify(it.missing_specs || [])
          ]);
        }

        const newOrderStatus = result.processing_state === 'FAILED' ? 'PENDING_REVIEW' : 'PENDING_REVIEW';
        const reviewNotes = result.processing_errors.length > 0
          ? `Falha / Avisos de processamento: ${result.processing_errors.join('; ')}`
          : null;

        db.run(`
          UPDATE orders 
          SET status = ?, processed_data = ?, review_notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [newOrderStatus, JSON.stringify(result), reviewNotes, orderId]);

        // Marca tarefa como completada
        db.run('UPDATE processing_tasks SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          'COMPLETED',
          JSON.stringify({ itemCount: result.items.length, state: result.processing_state }),
          task.id
        ]);
      });
    } catch (err) {
      console.error(`[TaskQueue] Falha ao executar IA para pedido ${orderId}:`, err);
      // Registra falha na tarefa, mas NUNCA apaga a mensagem original
      db.run(`
        UPDATE processing_tasks 
        SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [err.message, task.id]);

      db.run(`
        UPDATE orders 
        SET status = 'PENDING_REVIEW', review_notes = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [`Falha temporária de interpretação automática: ${err.message}. A mensagem original foi preservada para análise do operador.`, orderId]);
    }
  }
}

module.exports = new TaskQueue();
