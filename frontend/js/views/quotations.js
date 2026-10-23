// Gestão de Cotações e Comparação de Fornecedores
const QuotationsView = {
  currentQuotationId: null,

  async render(container, quotationId = null) {
    this.currentQuotationId = quotationId;

    if (quotationId) {
      await this.renderQuotationDetail(container, quotationId);
    } else {
      await this.renderQuotationList(container);
    }
  },

  async renderQuotationList(container) {
    container.innerHTML = `<div class="loading">Carregando cotações ativas...</div>`;

    try {
      const data = await api.getQuotations();
      const quotations = data.quotations || [];

      container.innerHTML = `
        <div class="table-container">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">Cotações Comerciais com Fornecedores</h3>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" onclick="QuotationsView.openNewSupplierModal()">+ Cadastrar Fornecedor</button>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Código Cotação</th>
                <th>Pedido Origem</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Itens Cotados</th>
                <th>Propostas Recebidas</th>
                <th>Criado em</th>
                <th style="text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${quotations.length === 0 ? `
                <tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma cotação gerada ainda. Aprove pedidos na tela de Revisão para iniciar cotações.</td></tr>
              ` : quotations.map(q => `
                <tr>
                  <td><strong>${q.quotation_code}</strong></td>
                  <td>${q.order_code}</td>
                  <td>${q.client_name || 'Cliente Balcão'}</td>
                  <td>${renderStatusBadge(q.status)}</td>
                  <td>${q.item_count || 0} material(is)</td>
                  <td><strong>${q.proposal_count || 0} proposta(s)</strong></td>
                  <td>${new Date(q.created_at).toLocaleDateString('pt-BR')}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-primary btn-sm" onclick="App.navigateTo('quotations', '${q.id}')">Ver Mapa Comparativo</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Erro: ${err.message}</div>`;
    }
  },

  async renderQuotationDetail(container, quotationId) {
    container.innerHTML = `<div class="loading">Carregando mapa comparativo de cotação...</div>`;

    try {
      const data = await api.getQuotation(quotationId);
      const { quotation, proposals, items } = data;

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('quotations')">← Voltar para Cotações</button>
            <h2 style="font-size: 18px; font-weight: 700;">Mapa Comparativo: ${quotation.quotation_code}</h2>
            ${renderStatusBadge(quotation.status)}
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="/api/quotations/${quotation.id}/export/csv" class="btn btn-secondary btn-sm" target="_blank">📥 Exportar CSV (Excel)</a>
            <a href="/api/quotations/${quotation.id}/export/json" class="btn btn-secondary btn-sm" target="_blank">{ } Exportar JSON</a>
            <button class="btn btn-primary btn-sm" onclick="QuotationsView.openAddProposalModal('${quotation.id}')">+ Inserir Proposta de Fornecedor</button>
          </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Status do Mapa de Preços:</div>
              <div style="font-size: 14px; font-weight: 600; margin-top: 2px;">
                ${proposals.length} proposta(s) de fornecedor registradas | ${items.length} itens a suprir
              </div>
            </div>
            <div>
              <span style="font-size: 12px; color: var(--text-muted);">Fornecedores cotados: </span>
              ${proposals.map(p => `<strong>${p.supplier_name}</strong>`).join(', ') || 'Nenhuma proposta lançada'}
            </div>
          </div>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Descrição do Material</th>
                <th>Quantidade</th>
                <th>Unidade</th>
                <th style="background-color: #ecfdf5; color: #065f46;">Menor Preço Unit.</th>
                <th style="background-color: #ecfdf5; color: #065f46;">Melhor Fornecedor</th>
                ${proposals.map(p => `
                  <th style="background-color: #eff6ff; color: #1e40af;">
                    ${escapeHtml(p.supplier_name)}
                    <div style="font-size: 10.5px; font-weight: normal; color: #64748b;">Prazo: ${p.delivery_deadline_days}d | ${p.payment_terms || 'Cond. padrão'}</div>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr>
                  <td><strong>#${idx + 1}</strong></td>
                  <td><code>${it.sku || 'N/D'}</code></td>
                  <td>
                    <strong>${escapeHtml(it.product_name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">Pedido: "${escapeHtml(it.original_text)}"</div>
                  </td>
                  <td><strong>${it.quantity}</strong></td>
                  <td>${it.unit}</td>
                  <td style="background-color: #f0fdf4; font-weight: 700; color: #059669; font-size: 14px;">
                    ${it.lowest_unit_price !== null ? `R$ ${it.lowest_unit_price.toFixed(2)}` : '<span style="color:#94a3b8; font-weight:normal;">Aguardando</span>'}
                  </td>
                  <td style="background-color: #f0fdf4; font-weight: 600; color: #065f46;">
                    ${it.best_supplier || '-'}
                  </td>
                  ${proposals.map(p => {
                    const offer = it.offers.find(o => o.supplier_id === p.supplier_id);
                    if (!offer) return '<td style="color: #94a3b8; text-align: center;">-</td>';
                    const isWinner = offer.unit_price === it.lowest_unit_price;
                    return `
                      <td style="${isWinner ? 'background-color: #fefce8; font-weight: 700;' : ''}">
                        <div>R$ ${offer.unit_price.toFixed(2)}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${offer.brand_offered || 'Marca padrão'}</div>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Erro: ${err.message}</div>`;
    }
  },

  async openAddProposalModal(quotationId) {
    try {
      const supData = await api.getSuppliers();
      const suppliers = supData.suppliers || [];

      if (suppliers.length === 0) {
        alert('Nenhum fornecedor cadastrado. Cadastre um fornecedor primeiro.');
        return;
      }

      const qData = await api.getQuotation(quotationId);
      const items = qData.items || [];

      const supplierName = prompt(`Selecione o Fornecedor digitando o número:\n` + suppliers.map((s, idx) => `${idx + 1} - ${s.name}`).join('\n'));
      const idx = parseInt(supplierName, 10) - 1;
      if (isNaN(idx) || !suppliers[idx]) return;

      const chosenSup = suppliers[idx];
      const proposalCode = prompt(`Código da proposta/orçamento de ${chosenSup.name}:`, `PROP-${Date.now().toString().slice(-4)}`);
      const paymentTerms = prompt('Condição de Pagamento (ex: 28 DDL, À vista):', chosenSup.payment_terms || '28 DDL');
      const deliveryDays = prompt('Prazo de entrega em dias úteis:', String(chosenSup.delivery_days || 2));

      const proposalItems = [];
      for (const it of items) {
        const priceStr = prompt(`Preço Unitário (R$) para: "${it.product_name}" (Qtd: ${it.quantity} ${it.unit}):`, '15.50');
        if (!priceStr) continue;
        const brand = prompt(`Marca ofertada para "${it.product_name}":`, 'Sil / Tigre / Steck');

        proposalItems.push({
          quotationItemId: it.quotation_item_id,
          unitPrice: parseFloat(priceStr.replace(',', '.')),
          quantity: it.quantity,
          brandOffered: brand || 'Nacional NBR',
          deliveryDays: parseInt(deliveryDays, 10) || 2
        });
      }

      if (proposalItems.length === 0) {
        alert('Nenhum preço lançado para a proposta.');
        return;
      }

      await api.addSupplierProposal(quotationId, {
        supplierId: chosenSup.id,
        proposalCode,
        paymentTerms,
        deliveryDeadlineDays: parseInt(deliveryDays, 10) || 2,
        validityDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        items: proposalItems
      });

      App.showToast('Proposta de fornecedor lançada com sucesso!', 'success');
      this.renderQuotationDetail(document.getElementById('contentContainer'), quotationId);
    } catch (err) {
      App.showToast(`Erro ao lançar proposta: ${err.message}`, 'error');
    }
  },

  openNewSupplierModal() {
    const name = prompt('Nome / Razão Social do Fornecedor:');
    if (!name) return;
    const phone = prompt('Telefone / WhatsApp de contato:');
    const terms = prompt('Condições habituais de pagamento (ex: 28 DDL):', '28 DDL');
    const delivery = prompt('Prazo médio de entrega (dias):', '2');

    api.createSupplier({
      name,
      phone,
      payment_terms: terms,
      delivery_days: parseInt(delivery, 10) || 2
    }).then(() => {
      App.showToast('Fornecedor cadastrado!', 'success');
      this.render(document.getElementById('contentContainer'), this.currentQuotationId);
    }).catch(err => {
      App.showToast(`Erro: ${err.message}`, 'error');
    });
  }
};
