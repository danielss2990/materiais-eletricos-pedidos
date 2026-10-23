const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../database/connection');
const upload = require('../middlewares/uploadMiddleware');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { auditLog } = require('../middlewares/auditMiddleware');
const taskQueue = require('../services/queue/taskQueue');

const router = express.Router();

// GET /api/orders - Listagem com filtros
router.get('/', authMiddleware(), (req, res) => {
  const { status, entry_method, channel_id, search, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT 
      o.*, 
      c.name as client_name, 
      c.phone as client_phone, 
      c.email as client_email,
      ch.name as channel_name,
      ch.type as channel_type,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND needs_review = 1) as review_count,
      (SELECT COUNT(*) FROM attachments WHERE order_id = o.id) as attachment_count
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN channels ch ON o.channel_id = ch.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }
  if (entry_method) {
    query += ' AND o.entry_method = ?';
    params.push(entry_method);
  }
  if (channel_id) {
    query += ' AND o.channel_id = ?';
    params.push(channel_id);
  }
  if (search) {
    query += ' AND (o.order_code LIKE ? OR o.original_text LIKE ? OR c.name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const orders = db.all(query, params);
  const total = db.get('SELECT COUNT(*) as count FROM orders').count;

  return res.json({ orders, total });
});

// GET /api/orders/:id - Detalhes do pedido
router.get('/:id', authMiddleware(), (req, res) => {
  const { id } = req.params;
  const order = db.get(`
    SELECT 
      o.*, 
      c.name as client_name, 
      c.phone as client_phone, 
      c.email as client_email,
      ch.name as channel_name,
      ch.type as channel_type
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN channels ch ON o.channel_id = ch.id
    WHERE o.id = ? OR o.order_code = ?
  `, [id, id]);

  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }

  const items = db.all(`
    SELECT oi.*, p.name as matched_product_name, p.sku as matched_product_sku,
           sp.name as suggested_product_name, sp.sku as suggested_product_sku
    FROM order_items oi
    LEFT JOIN products p ON oi.matched_product_id = p.id
    LEFT JOIN products sp ON oi.suggested_product_id = sp.id
    WHERE oi.order_id = ?
    ORDER BY oi.id ASC
  `, [order.id]);

  const attachments = db.all(`
    SELECT id, filename, mime_type, file_size_bytes, processing_status, created_at
    FROM attachments
    WHERE order_id = ?
  `, [order.id]);

  const message = order.message_id ? db.get('SELECT * FROM messages WHERE id = ?', [order.message_id]) : null;

  return res.json({ order, items, attachments, message });
});

// POST /api/orders/manual - Cadastro manual direto
router.post('/manual', authMiddleware(), (req, res) => {
  const { clientName, clientPhone, clientEmail, text, notes } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'O texto do pedido é obrigatório.' });
  }

  let clientId = null;
  if (clientPhone || clientEmail || clientName) {
    const existing = db.get('SELECT id FROM clients WHERE phone = ? OR email = ?', [clientPhone || '', clientEmail || '']);
    if (existing) {
      clientId = existing.id;
    } else {
      clientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
      db.run('INSERT INTO clients (id, name, phone, email) VALUES (?, ?, ?, ?)', [
        clientId,
        clientName || 'Cliente Manual',
        clientPhone || null,
        clientEmail || null
      ]);
    }
  }

  const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
  const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
  const orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

  db.run(`
    INSERT INTO orders (id, order_code, client_id, channel_id, entry_method, status, original_text, review_notes)
    VALUES (?, ?, ?, 'chan_manual_balcao', 'MANUAL_ENTRY', 'PROCESSING', ?, ?)
  `, [orderId, orderCode, clientId, text.trim(), notes || 'Pedido digitado manualmente pelo operador.']);

  auditLog('CREATE_MANUAL_ORDER', 'ORDER', orderId, null, { orderCode, text }, req.user?.userId, req);

  // Enfileira processamento da IA
  taskQueue.enqueue({
    entityType: 'ORDER',
    entityId: orderId,
    taskType: 'AI_EXTRACTION',
    payload: { orderId, orderCode, text: text.trim(), origin: 'MANUAL_ENTRY' }
  });

  return res.status(201).json({
    order_id: orderId,
    order_code: orderCode,
    status: 'PROCESSING',
    message: 'Pedido manual registrado e enviado para interpretação da IA.'
  });
});

// POST /api/orders/upload - Upload de arquivo de contingência (áudio, foto, documento)
router.post('/upload', authMiddleware(), upload.array('files', 10), (req, res) => {
  const { clientName, clientPhone, notes, text } = req.body;
  const files = req.files || [];

  if (files.length === 0 && (!text || text.trim().length === 0)) {
    return res.status(400).json({ error: 'Envie ao menos um arquivo ou informe o texto do pedido.' });
  }

  let clientId = null;
  if (clientPhone || clientName) {
    const existing = db.get('SELECT id FROM clients WHERE phone = ?', [clientPhone || '']);
    if (existing) {
      clientId = existing.id;
    } else {
      clientId = `cli_${crypto.randomBytes(6).toString('hex')}`;
      db.run('INSERT INTO clients (id, name, phone) VALUES (?, ?, ?)', [
        clientId,
        clientName || 'Cliente Upload',
        clientPhone || null
      ]);
    }
  }

  const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
  const count = db.get('SELECT COUNT(*) as c FROM orders').c + 1;
  const orderCode = `PED-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

  const initialText = text ? text.trim() : `[Pedido com ${files.length} anexo(s) enviado para processamento multimodal]`;

  db.transaction(() => {
    db.run(`
      INSERT INTO orders (id, order_code, client_id, channel_id, entry_method, status, original_text, review_notes)
      VALUES (?, ?, ?, 'chan_manual_balcao', 'FILE_IMPORT', 'PROCESSING', ?, ?)
    `, [orderId, orderCode, clientId, initialText, notes || 'Importação de arquivo de contingência / balcão.']);

    for (const f of files) {
      const attId = `att_${crypto.randomBytes(6).toString('hex')}`;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');

      db.run(`
        INSERT INTO attachments (id, order_id, filename, file_path, mime_type, file_size_bytes, sha256_hash, processing_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'STORED')
      `, [attId, orderId, f.originalname, f.path, f.mimetype, f.size, hash]);
    }
  });

  auditLog('UPLOAD_CONTINGENCY_ORDER', 'ORDER', orderId, null, { orderCode, fileCount: files.length }, req.user?.userId, req);

  // Enfileira para extração multimodal
  taskQueue.enqueue({
    entityType: 'ORDER',
    entityId: orderId,
    taskType: 'AI_EXTRACTION',
    payload: { orderId, orderCode, text: text || '', origin: 'FILE_IMPORT' }
  });

  return res.status(201).json({
    order_id: orderId,
    order_code: orderCode,
    file_count: files.length,
    status: 'PROCESSING',
    message: 'Arquivos recebidos com sucesso e enviados para extração multimodal da IA.'
  });
});

// POST /api/orders/:id/reprocess - Reprocessa a IA
router.post('/:id/reprocess', authMiddleware(), (req, res) => {
  const { id } = req.params;
  const order = db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

  db.run(`UPDATE orders SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);

  taskQueue.enqueue({
    entityType: 'ORDER',
    entityId: order.id,
    taskType: 'AI_EXTRACTION',
    payload: { orderId: order.id, orderCode: order.order_code, text: order.original_text, origin: order.entry_method }
  });

  auditLog('REPROCESS_ORDER', 'ORDER', order.id, null, { status: 'PROCESSING' }, req.user?.userId, req);

  return res.json({ message: 'Pedido reenviado para a fila de processamento da IA.' });
});

module.exports = router;
