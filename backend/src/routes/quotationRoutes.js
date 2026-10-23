const express = require('express');
const crypto = require('node:crypto');
const db = require('../database/connection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { auditLog } = require('../middlewares/auditMiddleware');
const quotationService = require('../services/quotation/quotationService');
const exportService = require('../services/quotation/exportService');

const router = express.Router();

// GET /api/quotations - Listar cotações
router.get('/', authMiddleware(), (req, res) => {
  const quotations = db.all(`
    SELECT q.*, o.order_code, c.name as client_name,
           (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count,
           (SELECT COUNT(*) FROM supplier_proposals WHERE quotation_id = q.id) as proposal_count
    FROM quotations q
    JOIN orders o ON q.order_id = o.id
    LEFT JOIN clients c ON o.client_id = c.id
    ORDER BY q.created_at DESC
  `);

  return res.json({ quotations });
});

// GET /api/quotations/suppliers - Listar fornecedores
router.get('/suppliers', authMiddleware(), (req, res) => {
  const suppliers = db.all('SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC');
  return res.json({ suppliers });
});

// POST /api/quotations/suppliers - Cadastrar fornecedor
router.post('/suppliers', authMiddleware(['ADMIN', 'QUOTATION_ANALYST']), (req, res) => {
  const { name, cnpj_cpf, contact_name, phone, email, payment_terms, delivery_days } = req.body;
  if (!name) return res.status(400).json({ error: 'O nome do fornecedor é obrigatório.' });

  const id = `sup_${crypto.randomBytes(6).toString('hex')}`;
  db.run(`
    INSERT INTO suppliers (id, name, cnpj_cpf, contact_name, phone, email, payment_terms, delivery_days, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [id, name.trim(), cnpj_cpf || null, contact_name || null, phone || null, email || null, payment_terms || null, parseInt(delivery_days, 10) || 2]);

  auditLog('CREATE_SUPPLIER', 'SUPPLIER', id, null, req.body, req.user?.userId, req);
  const supplier = db.get('SELECT * FROM suppliers WHERE id = ?', [id]);
  return res.status(201).json({ message: 'Fornecedor cadastrado.', supplier });
});

// POST /api/quotations/create-from-order/:orderId - Criar cotação a partir de pedido
router.post('/create-from-order/:orderId', authMiddleware(), (req, res) => {
  const { orderId } = req.params;
  try {
    const result = quotationService.createQuotationFromOrder(orderId, req.user?.userId);
    return res.status(201).json({ message: 'Cotação criada com sucesso.', ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/quotations/:id - Detalhes e matriz de comparação
router.get('/:id', authMiddleware(), (req, res) => {
  const { id } = req.params;
  try {
    const matrix = quotationService.getComparisonMatrix(id);
    return res.json(matrix);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
});

// POST /api/quotations/:id/proposals - Registrar proposta de fornecedor
router.post('/:id/proposals', authMiddleware(), (req, res) => {
  const { id } = req.params;
  const { supplierId, proposalCode, paymentTerms, deliveryDeadlineDays, validityDate, items } = req.body;

  if (!supplierId || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Fornecedor e itens da proposta são obrigatórios.' });
  }

  try {
    const result = quotationService.addSupplierProposal({
      quotationId: id,
      supplierId,
      proposalCode,
      paymentTerms,
      deliveryDeadlineDays: parseInt(deliveryDeadlineDays, 10) || 2,
      validityDate,
      items
    });

    auditLog('ADD_SUPPLIER_PROPOSAL', 'QUOTATION', id, null, req.body, req.user?.userId, req);
    return res.status(201).json({ message: 'Proposta registrada com sucesso.', ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/quotations/:id/export/csv - Download de CSV
router.get('/:id/export/csv', authMiddleware(), (req, res) => {
  const { id } = req.params;
  try {
    const csvContent = exportService.exportQuotationToCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cotacao_${id}.csv"`);
    return res.send(csvContent);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/quotations/:id/export/json - Download de JSON
router.get('/:id/export/json', authMiddleware(), (req, res) => {
  const { id } = req.params;
  try {
    const jsonData = exportService.exportQuotationToJson(id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cotacao_${id}.json"`);
    return res.json(jsonData);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
