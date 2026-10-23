const express = require('express');
const db = require('../database/connection');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// GET /api/reports/kpis - Indicadores consolidados calculados sobre os dados reais
router.get('/kpis', authMiddleware(), (req, res) => {
  // Volume total de pedidos
  const totalOrders = db.get('SELECT COUNT(*) as c FROM orders').c;

  // Pedidos por status
  const pendingReview = db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'PENDING_REVIEW'").c;
  const inQuotation = db.get("SELECT COUNT(*) as c FROM orders WHERE status IN ('APPROVED', 'IN_QUOTATION', 'QUOTED')").c;
  const processing = db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'PROCESSING'").c;
  const rejected = db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'REJECTED'").c;

  // Volume por método de entrada (Automático vs Manual vs Importado)
  const byEntryMethod = db.all(`
    SELECT entry_method, COUNT(*) as count 
    FROM orders 
    GROUP BY entry_method
  `);

  // Itens que precisaram de revisão humana
  const totalItems = db.get('SELECT COUNT(*) as c FROM order_items').c;
  const reviewedItems = db.get('SELECT COUNT(*) as c FROM order_items WHERE needs_review = 1').c;
  const humanReviewRate = totalItems > 0 ? Math.round((reviewedItems / totalItems) * 100) : 0;

  // Falhas de tarefas assíncronas / erros
  const failedTasks = db.get("SELECT COUNT(*) as c FROM processing_tasks WHERE status = 'FAILED'").c;
  const completedTasks = db.get("SELECT COUNT(*) as c FROM processing_tasks WHERE status = 'COMPLETED'").c;

  // Estimativa de custo de IA baseada no volume real
  // Estimativa de tokens Gemini 1.5 Flash (~500 tokens por pedido, $0.075 por milhão de tokens de input)
  const estimatedTokens = totalOrders * 600;
  const estimatedCostUsd = (estimatedTokens / 1000000) * 0.075;

  return res.json({
    kpis: {
      totalOrders,
      pendingReview,
      inQuotation,
      processing,
      rejected,
      totalItems,
      reviewedItems,
      humanReviewRate: `${humanReviewRate}%`,
      failedTasks,
      completedTasks,
      estimatedTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
    },
    byEntryMethod
  });
});

// GET /api/reports/history - Histórico por dia
router.get('/history', authMiddleware(), (req, res) => {
  const history = db.all(`
    SELECT DATE(created_at) as date, COUNT(*) as order_count,
           SUM(CASE WHEN entry_method = 'AUTOMATIC_WHATSAPP' THEN 1 ELSE 0 END) as whatsapp_count,
           SUM(CASE WHEN entry_method = 'AUTOMATIC_EMAIL' THEN 1 ELSE 0 END) as email_count,
           SUM(CASE WHEN entry_method IN ('MANUAL_ENTRY', 'FILE_IMPORT') THEN 1 ELSE 0 END) as manual_count
    FROM orders
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `);

  return res.json({ history });
});

// GET /api/reports/audit - Trilha de auditoria LGPD
router.get('/audit', authMiddleware(['ADMIN']), (req, res) => {
  const logs = db.all(`
    SELECT a.*, u.full_name as user_name, u.role as user_role
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);

  return res.json({ logs });
});

module.exports = router;
