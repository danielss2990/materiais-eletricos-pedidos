const quotationService = require('./quotationService');

class ExportService {
  /**
   * Exporta a matriz de cotação em formato CSV compatível com Excel e ERPs brasileiros.
   */
  exportQuotationToCsv(quotationId) {
    const data = quotationService.getComparisonMatrix(quotationId);
    const { quotation, proposals, items } = data;

    // Cabeçalho com BOM UTF-8 para abrir no Excel sem problemas de acentuação
    let csv = '\uFEFF';
    csv += `Cotação;${quotation.quotation_code};Data;${new Date(quotation.created_at).toLocaleDateString('pt-BR')}\n`;
    csv += `Status;${quotation.status};Observações;${(quotation.notes || '').replace(/;/g, ' ')}\n\n`;

    // Cabeçalho das Colunas
    const headers = [
      'Item',
      'SKU',
      'Descrição do Material',
      'Texto Original do Pedido',
      'Quantidade',
      'Unidade',
      'Menor Preço Unit. (R$)',
      'Fornecedor Mais Barato'
    ];

    // Colunas dinâmicas para cada fornecedor com proposta
    for (const p of proposals) {
      headers.push(`${p.supplier_name} - Preço Unit. (R$)`);
      headers.push(`${p.supplier_name} - Marca`);
      headers.push(`${p.supplier_name} - Prazo (Dias)`);
    }

    csv += headers.join(';') + '\n';

    let index = 1;
    for (const it of items) {
      const row = [
        index++,
        `"${it.sku || ''}"`,
        `"${it.product_name.replace(/"/g, '""')}"`,
        `"${it.original_text.replace(/"/g, '""')}"`,
        String(it.quantity).replace('.', ','),
        it.unit,
        it.lowest_unit_price !== null ? it.lowest_unit_price.toFixed(2).replace('.', ',') : 'N/D',
        `"${it.best_supplier || 'N/D'}"`
      ];

      for (const p of proposals) {
        const offer = it.offers.find(o => o.supplier_id === p.supplier_id);
        if (offer) {
          row.push(offer.unit_price.toFixed(2).replace('.', ','));
          row.push(`"${offer.brand_offered || ''}"`);
          row.push(String(offer.delivery_days || 0));
        } else {
          row.push('N/D');
          row.push('N/D');
          row.push('N/D');
        }
      }

      csv += row.join(';') + '\n';
    }

    return csv;
  }

  /**
   * Exporta a cotação em JSON padronizado.
   */
  exportQuotationToJson(quotationId) {
    return quotationService.getComparisonMatrix(quotationId);
  }
}

module.exports = new ExportService();
