const express = require('express');
const crypto = require('node:crypto');
const db = require('../database/connection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { auditLog } = require('../middlewares/auditMiddleware');
const quotationService = require('../services/quotation/quotationService');

const router = express.Router();

// GET /api/review/:orderId - Dados completos para tela dividida (Split-Screen)
router.get('/:orderId', authMiddleware(), (req, res) => {
  const { orderId } = req.params;

  const order = db.get(`
    SELECT o.*, c.name as client_name, c.phone as client_phone, c.email as client_email,
           ch.name as channel_name, ch.type as channel_type
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN channels ch ON o.channel_id = ch.id
    WHERE o.id = ? OR o.order_code = ?
  `, [orderId, orderId]);

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  const message = order.message_id ? db.get('SELECT * FROM messages WHERE id = ?', [order.message_id]) : null;

  const attachments = db.all(`
    SELECT id, filename, mime_type, file_size_bytes, processing_status, created_at
    FROM attachments
    WHERE order_id = ?
  `, [order.id]);

  const items = db.all(`
    SELECT oi.*, p.name as matched_product_name, p.sku as matched_product_sku,
           sp.name as suggested_product_name, sp.sku as suggested_product_sku
    FROM order_items oi
    LEFT JOIN products p ON oi.matched_product_id = p.id
    LEFT JOIN products sp ON oi.suggested_product_id = sp.id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
  `, [order.id]);

  // Lista de produtos ativos para seleção e conciliação
  const catalogProducts = db.all('SELECT id, sku, name, category, default_unit FROM products WHERE active = 1 ORDER BY name ASC');

  return res.json({
    order,
    message,
    attachments,
    items,
    catalogProducts
  });
});

// PUT /api/review/:orderId/items/:itemId - Edição de quantidade, specs e produto do catálogo
router.put('/:orderId/items/:itemId', authMiddleware(), (req, res) => {
  const { orderId, itemId } = req.params;
  const { normalized_name, quantity, unit, matched_product_id, technical_specs, review_reason, needs_review } = req.body;

  const item = db.get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [itemId, orderId]);
  if (!item) return res.status(404).json({ error: 'Item não encontrado.' });

  const oldValues = { ...item };

  db.run(`
    UPDATE order_items 
    SET normalized_name = COALESCE(?, normalized_name),
        quantity = COALESCE(?, quantity),
        unit = COALESCE(?, unit),
        matched_product_id = ?,
        technical_specs = COALESCE(?, technical_specs),
        review_reason = ?,
        needs_review = COALESCE(?, needs_review),
        status = 'EDITED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND order_id = ?
  `, [
    normalized_name,
    quantity !== undefined ? parseFloat(quantity) : null,
    unit,
    matched_product_id || null,
    technical_specs ? (typeof technical_specs === 'string' ? technical_specs : JSON.stringify(technical_specs)) : null,
    review_reason || null,
    needs_review !== undefined ? (needs_review ? 1 : 0) : null,
    itemId,
    orderId
  ]);

  auditLog('EDIT_ORDER_ITEM', 'ORDER_ITEM', itemId, oldValues, req.body, req.user?.userId, req);

  const updatedItem = db.get('SELECT * FROM order_items WHERE id = ?', [itemId]);
  return res.json({ message: 'Item atualizado com sucesso.', item: updatedItem });
});

// POST /api/review/:orderId/items - Adicionar item manualmente ao pedido
router.post('/:orderId/items', authMiddleware(), (req, res) => {
  const { orderId } = req.params;
  const { original_text, normalized_name, quantity, unit, matched_product_id, technical_specs } = req.body;

  if (!normalized_name || !quantity) {
    return res.status(400).json({ error: 'Nome e quantidade são obrigatórios.' });
  }

  const itemId = `item_${crypto.randomBytes(6).toString('hex')}`;

  db.run(`
    INSERT INTO order_items (
      id, order_id, original_text, normalized_name, quantity, unit,
      matched_product_id, technical_specs, confidence_score, needs_review, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, 0, 'EDITED')
  `, [
    itemId,
    orderId,
    original_text || normalized_name,
    normalized_name,
    parseFloat(quantity),
    unit || 'PC',
    matched_product_id || null,
    technical_specs ? (typeof technical_specs === 'string' ? technical_specs : JSON.stringify(technical_specs)) : '{}'
  ]);

  auditLog('ADD_ORDER_ITEM', 'ORDER_ITEM', itemId, null, req.body, req.user?.userId, req);

  const newItem = db.get('SELECT * FROM order_items WHERE id = ?', [itemId]);
  return res.status(201).json({ message: 'Item adicionado.', item: newItem });
});

// DELETE /api/review/:orderId/items/:itemId - Remove item do pedido
router.delete('/:orderId/items/:itemId', authMiddleware(), (req, res) => {
  const { orderId, itemId } = req.params;
  db.run('DELETE FROM order_items WHERE id = ? AND order_id = ?', [itemId, orderId]);
  auditLog('DELETE_ORDER_ITEM', 'ORDER_ITEM', itemId, null, null, req.user?.userId, req);
  return res.json({ message: 'Item removido do pedido.' });
});

// POST /api/review/:orderId/approve - Aprovação Humana do Pedido
router.post('/:orderId/approve', authMiddleware(), (req, res) => {
  const { orderId } = req.params;
  const { createQuotation = true, notes } = req.body;

  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  const userId = req.user?.userId || 'usr_vendedor';

  db.transaction(() => {
    // Marca todos os itens pendentes como APROVADOS
    db.run(`
      UPDATE order_items 
      SET status = 'APPROVED', needs_review = 0, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND status != 'REJECTED'
    `, [orderId]);

    // Atualiza status do pedido
    db.run(`
      UPDATE orders 
      SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, 
          review_notes = COALESCE(?, review_notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [userId, notes || 'Pedido validado e aprovado pelo operador humano.', orderId]);

    auditLog('APPROVE_ORDER', 'ORDER', orderId, { oldStatus: order.status }, { status: 'APPROVED', reviewedBy: userId }, userId, req);
  });

  let quotationInfo = null;
  if (createQuotation) {
    try {
      quotationInfo = quotationService.createQuotationFromOrder(orderId, userId);
    } catch (err) {
      console.warn(`[Review] Aviso ao gerar cotação: ${err.message}`);
    }
  }

  return res.json({
    message: 'Pedido aprovado com sucesso.',
    order_id: orderId,
    quotation: quotationInfo
  });
});

// POST /api/review/:orderId/reject - Rejeição do pedido
router.post('/:orderId/reject', authMiddleware(), (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  const userId = req.user?.userId || 'usr_vendedor';

  db.run(`
    UPDATE orders 
    SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, 
        review_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [userId, reason || 'Pedido rejeitado pelo operador.', orderId]);

  auditLog('REJECT_ORDER', 'ORDER', orderId, null, { status: 'REJECTED', reason }, userId, req);

  return res.json({ message: 'Pedido rejeitado.', order_id: orderId });
});

module.exports = router;
