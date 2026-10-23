const express = require('express');
const crypto = require('node:crypto');
const db = require('../database/connection');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { auditLog } = require('../middlewares/auditMiddleware');

const router = express.Router();

// GET /api/catalog - Listar materiais
router.get('/', authMiddleware(), (req, res) => {
  const { category, search, active, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (active !== undefined) {
    query += ' AND active = ?';
    params.push(parseInt(active, 10));
  }
  if (search) {
    query += ' AND (sku LIKE ? OR name LIKE ? OR technical_description LIKE ? OR synonyms_array LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY category ASC, name ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const products = db.all(query, params).map(p => ({
    ...p,
    synonyms: JSON.parse(p.synonyms_array || '[]'),
    specifications: JSON.parse(p.specifications_json || '{}')
  }));

  const total = db.get('SELECT COUNT(*) as c FROM products WHERE active = 1').c;

  return res.json({ products, total });
});

// POST /api/catalog - Criar novo produto
router.post('/', authMiddleware(['ADMIN', 'QUOTATION_ANALYST']), (req, res) => {
  const { sku, name, technical_description, synonyms = [], default_unit = 'PC', category = 'ACESSORIOS', specifications = {}, min_stock = 0 } = req.body;

  if (!sku || !name || !technical_description) {
    return res.status(400).json({ error: 'SKU, nome e descrição técnica são obrigatórios.' });
  }

  const existing = db.get('SELECT id FROM products WHERE sku = ?', [sku.trim().toUpperCase()]);
  if (existing) {
    return res.status(409).json({ error: `O SKU ${sku} já está cadastrado.` });
  }

  const id = `prod_${crypto.randomBytes(6).toString('hex')}`;
  const cleanSku = sku.trim().toUpperCase();

  db.run(`
    INSERT INTO products (id, sku, name, technical_description, synonyms_array, default_unit, category, specifications_json, min_stock, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    id,
    cleanSku,
    name.trim(),
    technical_description.trim(),
    JSON.stringify(Array.isArray(synonyms) ? synonyms : [synonyms]),
    default_unit,
    category,
    JSON.stringify(specifications || {}),
    parseInt(min_stock, 10) || 0
  ]);

  auditLog('CREATE_PRODUCT', 'PRODUCT', id, null, req.body, req.user?.userId, req);

  const newProduct = db.get('SELECT * FROM products WHERE id = ?', [id]);
  return res.status(201).json({ message: 'Produto cadastrado com sucesso.', product: newProduct });
});

// PUT /api/catalog/:id - Editar produto
router.put('/:id', authMiddleware(['ADMIN', 'QUOTATION_ANALYST']), (req, res) => {
  const { id } = req.params;
  const { sku, name, technical_description, synonyms, default_unit, category, specifications, min_stock, active } = req.body;

  const product = db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  const oldValues = { ...product };

  db.run(`
    UPDATE products 
    SET sku = COALESCE(?, sku),
        name = COALESCE(?, name),
        technical_description = COALESCE(?, technical_description),
        synonyms_array = COALESCE(?, synonyms_array),
        default_unit = COALESCE(?, default_unit),
        category = COALESCE(?, category),
        specifications_json = COALESCE(?, specifications_json),
        min_stock = COALESCE(?, min_stock),
        active = COALESCE(?, active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    sku ? sku.trim().toUpperCase() : null,
    name ? name.trim() : null,
    technical_description ? technical_description.trim() : null,
    synonyms ? JSON.stringify(Array.isArray(synonyms) ? synonyms : [synonyms]) : null,
    default_unit,
    category,
    specifications ? JSON.stringify(specifications) : null,
    min_stock !== undefined ? parseInt(min_stock, 10) : null,
    active !== undefined ? (active ? 1 : 0) : null,
    id
  ]);

  auditLog('UPDATE_PRODUCT', 'PRODUCT', id, oldValues, req.body, req.user?.userId, req);

  const updatedProduct = db.get('SELECT * FROM products WHERE id = ?', [id]);
  return res.json({ message: 'Produto atualizado com sucesso.', product: updatedProduct });
});

// GET /api/catalog/export/csv - Exportar catálogo para CSV
router.get('/export/csv', authMiddleware(), (req, res) => {
  const products = db.all('SELECT * FROM products ORDER BY category, sku');

  let csv = '\uFEFF';
  csv += 'SKU;Nome;Categoria;Unidade;Descrição Técnica;Sinônimos;Estoque Mínimo;Ativo\n';

  for (const p of products) {
    let syns = '';
    try {
      syns = JSON.parse(p.synonyms_array || '[]').join(' | ');
    } catch {
      syns = '';
    }

    csv += [
      `"${p.sku}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category}"`,
      `"${p.default_unit}"`,
      `"${p.technical_description.replace(/"/g, '""')}"`,
      `"${syns.replace(/"/g, '""')}"`,
      p.min_stock,
      p.active ? 'Sim' : 'Não'
    ].join(';') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="catalogo_materiais_eletricos.csv"');
  return res.send(csv);
});

module.exports = router;
