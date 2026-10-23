const crypto = require('node:crypto');
const db = require('../../database/connection');

class QuotationService {
  /**
   * Cria uma cotação formal a partir de um pedido aprovado.
   */
  createQuotationFromOrder(orderId, userId = null) {
    const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new Error('Pedido não encontrado.');

    const approvedItems = db.all(`
      SELECT * FROM order_items 
      WHERE order_id = ? AND status = 'APPROVED'
    `, [orderId]);

    if (approvedItems.length === 0) {
      throw new Error('O pedido não possui itens aprovados para cotação.');
    }

    const quotationId = `quot_${crypto.randomBytes(6).toString('hex')}`;
    const count = db.get('SELECT COUNT(*) as c FROM quotations').c + 1;
    const quotationCode = `COT-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

    db.transaction(() => {
      db.run(`
        INSERT INTO quotations (id, order_id, quotation_code, status, notes)
        VALUES (?, ?, ?, 'DRAFT', ?)
      `, [quotationId, orderId, quotationCode, `Cotação gerada a partir do pedido ${order.order_code}`]);

      for (const item of approvedItems) {
        const qItemId = `qitem_${crypto.randomBytes(6).toString('hex')}`;
        const prodId = item.matched_product_id || item.suggested_product_id;
        db.run(`
          INSERT INTO quotation_items (id, quotation_id, order_item_id, product_id, quantity)
          VALUES (?, ?, ?, ?, ?)
        `, [qItemId, quotationId, item.id, prodId, item.quantity]);
      }

      // Atualiza status do pedido
      db.run(`UPDATE orders SET status = 'IN_QUOTATION', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);

      // Trilha de auditoria
      if (userId) {
        db.run(`
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_values)
          VALUES (?, ?, 'CREATE_QUOTATION', 'QUOTATION', ?, ?)
        `, [`log_${crypto.randomBytes(6).toString('hex')}`, userId, quotationId, JSON.stringify({ quotationCode, itemCount: approvedItems.length })]);
      }
    });

    return { quotation_id: quotationId, quotation_code: quotationCode };
  }

  /**
   * Adiciona ou atualiza proposta de fornecedor para uma cotação.
   */
  addSupplierProposal({ quotationId, supplierId, proposalCode, paymentTerms, deliveryDeadlineDays, validityDate, items = [] }) {
    const propId = `prop_${crypto.randomBytes(6).toString('hex')}`;
    let total = 0;

    for (const it of items) {
      total += (it.unitPrice || 0) * (it.quantity || 1);
    }

    db.transaction(() => {
      db.run(`
        INSERT INTO supplier_proposals (id, quotation_id, supplier_id, proposal_code, total_amount, payment_terms, delivery_deadline_days, validity_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [propId, quotationId, supplierId, proposalCode, total, paymentTerms, deliveryDeadlineDays, validityDate]);

      for (const it of items) {
        const propItemId = `propitem_${crypto.randomBytes(6).toString('hex')}`;
        const itemTotal = (it.unitPrice || 0) * (it.quantity || 1);
        db.run(`
          INSERT INTO supplier_proposal_items (id, supplier_proposal_id, quotation_item_id, unit_price, total_price, brand_offered, availability, delivery_days)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [propItemId, propId, it.quotationItemId, it.unitPrice, itemTotal, it.brandOffered || '', it.availability || 'PRONTA_ENTREGA', it.deliveryDays || 0]);
      }

      db.run(`UPDATE quotations SET status = 'RECEIVED_PRICES', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [quotationId]);
    });

    return { proposal_id: propId, total_amount: total };
  }

  /**
   * Gera a matriz de comparação detalhada entre todos os fornecedores da cotação.
   */
  getComparisonMatrix(quotationId) {
    const quotation = db.get('SELECT * FROM quotations WHERE id = ?', [quotationId]);
    if (!quotation) throw new Error('Cotação não encontrada.');

    const qItems = db.all(`
      SELECT qi.*, p.name as product_name, p.sku, oi.original_text, oi.unit
      FROM quotation_items qi
      JOIN products p ON qi.product_id = p.id
      JOIN order_items oi ON qi.order_item_id = oi.id
      WHERE qi.quotation_id = ?
    `, [quotationId]);

    const proposals = db.all(`
      SELECT sp.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email
      FROM supplier_proposals sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE sp.quotation_id = ?
    `, [quotationId]);

    const matrixItems = qItems.map(item => {
      const supplierOffers = [];
      let lowestPrice = Infinity;
      let winningOffer = null;

      for (const prop of proposals) {
        const propItem = db.get(`
          SELECT * FROM supplier_proposal_items 
          WHERE supplier_proposal_id = ? AND quotation_item_id = ?
        `, [prop.id, item.id]);

        if (propItem) {
          const offer = {
            supplier_id: prop.supplier_id,
            supplier_name: prop.supplier_name,
            unit_price: propItem.unit_price,
            total_price: propItem.total_price,
            brand_offered: propItem.brand_offered,
            availability: propItem.availability,
            delivery_days: propItem.delivery_days || prop.delivery_deadline_days,
            payment_terms: prop.payment_terms
          };
          supplierOffers.push(offer);

          if (propItem.unit_price < lowestPrice) {
            lowestPrice = propItem.unit_price;
            winningOffer = offer;
          }
        }
      }

      return {
        quotation_item_id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        original_text: item.original_text,
        quantity: item.quantity,
        unit: item.unit,
        lowest_unit_price: lowestPrice === Infinity ? null : lowestPrice,
        best_supplier: winningOffer ? winningOffer.supplier_name : null,
        offers: supplierOffers
      };
    });

    return {
      quotation,
      proposals,
      items: matrixItems
    };
  }
}

module.exports = new QuotationService();
