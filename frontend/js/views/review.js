// Revisão Humana em Tela Dividida (Split-Screen)
const ReviewView = {
  currentOrderId: null,
  orderData: null,

  async render(container, orderId) {
    this.currentOrderId = orderId;
    container.innerHTML = `<div class="loading">Carregando dados para revisão...</div>`;

    if (!orderId) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <h3>Nenhum pedido selecionado para revisão.</h3>
          <p style="color: var(--text-muted); margin: 12px 0;">Selecione um pedido na lista para iniciar a conferência.</p>
          <button class="btn btn-primary" onclick="App.navigateTo('orders')">Ver Lista de Pedidos</button>
        </div>
      `;
      return;
    }

    try {
      const data = await api.getReviewData(orderId);
      this.orderData = data;
      const { order, message, attachments, items, catalogProducts } = data;

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn btn-secondary btn-sm" onclick="App.navigateTo('orders')">← Voltar</button>
            <h2 style="font-size: 18px; font-weight: 700;">Revisão de Pedido: ${order.order_code}</h2>
            ${renderChannelBadge(order.entry_method)}
            ${renderStatusBadge(order.status)}
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-danger btn-sm" onclick="ReviewView.handleReject()">Rejeitar</button>
            <button class="btn btn-success" onclick="ReviewView.handleApprove()">✓ Aprovar Pedido & Gerar Cotação</button>
          </div>
        </div>

        <div class="split-screen">
          <!-- PAINEL ESQUERDO: CONTEÚDO ORIGINAL E MÍDIAS -->
          <div class="split-left">
            <div class="split-header">
              <span class="split-title">Conteúdo Original do Cliente</span>
              <span style="font-size: 12px; color: var(--text-muted);">${order.client_name || 'Cliente Balcão'} (${order.client_phone || 'Sem telefone'})</span>
            </div>
            <div class="split-content">
              <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">
                Mensagem Original Recebida:
              </div>
              <div class="message-box">${escapeHtml(order.original_text || 'Sem mensagem textual.')}</div>

              ${attachments && attachments.length > 0 ? `
                <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">
                  Anexos e Arquivos Multimodais (${attachments.length}):
                </div>
                ${attachments.map(att => `
                  <div class="media-viewer">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <span style="font-size: 13px; font-weight: 600;">📎 ${att.filename}</span>
                      <a href="/api/files/${att.id}" target="_blank" class="btn btn-secondary btn-sm">Baixar / Ver</a>
                    </div>
                    ${att.mime_type.startsWith('audio/') ? `
                      <audio controls style="width: 100%; margin-top: 6px;">
                        <source src="/api/files/${att.id}" type="${att.mime_type}">
                        Seu navegador não suporta reprodução de áudio.
                      </audio>
                    ` : ''}
                    ${att.mime_type.startsWith('image/') ? `
                      <img src="/api/files/${att.id}" alt="${att.filename}" style="max-height: 250px; object-fit: contain; margin-top: 6px;" />
                    ` : ''}
                  </div>
                `).join('')}
              ` : '<div style="font-size: 12.5px; color: var(--text-muted); margin-top: 10px;">Nenhum arquivo físico anexado a este pedido.</div>'}

              ${order.review_notes ? `
                <div style="margin-top: 16px; padding: 12px; background-color: #f1f5f9; border-radius: var(--radius); font-size: 12.5px;">
                  <strong>Notas do Sistema / Auditoria:</strong><br/>
                  ${escapeHtml(order.review_notes)}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- PAINEL DIREITO: ITENS EXTRAÍDOS, AMBIGUIDADES E CATÁLOGO -->
          <div class="split-right">
            <div class="split-header">
              <span class="split-title">Itens Identificados pela IA (${items.length})</span>
              <button class="btn btn-secondary btn-sm" onclick="ReviewView.openAddItemModal()">+ Adicionar Item</button>
            </div>
            <div class="split-content" id="reviewItemsContainer">
              ${items.length === 0 ? `
                <div style="padding: 30px; text-align: center; color: var(--text-muted);">
                  Nenhum material foi identificado automaticamente.<br/>
                  Clique em "+ Adicionar Item" para inserir manualmente.
                </div>
              ` : items.map((item, idx) => `
                <div class="review-item-card ${item.needs_review ? 'has-ambiguity' : ''}" id="card-item-${item.id}">
                  <div class="review-item-header">
                    <span style="font-weight: 700; font-size: 14px;">Item #${idx + 1}</span>
                    <div style="display: flex; gap: 6px; align-items: center;">
                      ${item.needs_review ? '<span class="badge" style="background:#fef3c7; color:#b45309;">⚠️ Atenção Necessária</span>' : '<span class="badge" style="background:#ecfdf5; color:#065f46;">✓ Verificado</span>'}
                      <button class="btn btn-secondary btn-sm" style="color: var(--danger); padding: 2px 6px;" onclick="ReviewView.handleDeleteItem('${item.id}')" title="Excluir">✕</button>
                    </div>
                  </div>

                  <div class="review-item-orig">
                    Texto original no pedido: "<strong>${escapeHtml(item.original_text)}</strong>"
                  </div>

                  ${item.needs_review && item.review_reason ? `
                    <div class="ambiguity-alert">
                      <strong>Ambiguidade Detectada:</strong> ${escapeHtml(item.review_reason)}
                    </div>
                  ` : ''}

                  <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div>
                      <label class="form-label">Material Normalizado</label>
                      <input type="text" class="form-control" id="norm-${item.id}" value="${escapeHtml(item.normalized_name)}" />
                    </div>
                    <div>
                      <label class="form-label">Quantidade</label>
                      <input type="number" step="any" class="form-control" id="qty-${item.id}" value="${item.quantity}" />
                    </div>
                    <div>
                      <label class="form-label">Unidade</label>
                      <select class="form-control" id="unit-${item.id}">
                        <option value="PC" ${item.unit === 'PC' ? 'selected' : ''}>Peça (PC)</option>
                        <option value="ROLO_100M" ${item.unit === 'ROLO_100M' ? 'selected' : ''}>Rolo 100m</option>
                        <option value="ROLO_50M" ${item.unit === 'ROLO_50M' ? 'selected' : ''}>Rolo 50m</option>
                        <option value="ROLO" ${item.unit === 'ROLO' ? 'selected' : ''}>Rolo</option>
                        <option value="M" ${item.unit === 'M' ? 'selected' : ''}>Metro (M)</option>
                        <option value="BARRA_3M" ${item.unit === 'BARRA_3M' ? 'selected' : ''}>Barra 3m</option>
                        <option value="CX" ${item.unit === 'CX' ? 'selected' : ''}>Caixa (CX)</option>
                      </select>
                    </div>
                  </div>

                  <div style="margin-top: 10px;">
                    <label class="form-label">Vínculo com Catálogo (SKU)</label>
                    <select class="form-control" id="prod-${item.id}">
                      <option value="">-- Não associado ao catálogo --</option>
                      ${catalogProducts.map(cp => `
                        <option value="${cp.id}" ${(item.matched_product_id === cp.id || (!item.matched_product_id && item.suggested_product_id === cp.id)) ? 'selected' : ''}>
                          [${cp.sku}] ${cp.name} (${cp.category})
                        </option>
                      `).join('')}
                    </select>
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
                    <label style="font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                      <input type="checkbox" id="res-${item.id}" ${!item.needs_review ? 'checked' : ''} />
                      Marcar como revisado e confirmado
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="ReviewView.handleSaveItem('${item.id}')">Salvar Item</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="split-footer">
              <span style="font-size: 12px; color: var(--text-muted); margin-right: auto;">
                A aprovação humana transfere a lista definitiva para o módulo de cotação com fornecedores.
              </span>
              <button class="btn btn-success" onclick="ReviewView.handleApprove()">✓ Aprovar Pedido</button>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Erro ao carregar tela de revisão: ${err.message}</div>`;
    }
  },

  async handleSaveItem(itemId) {
    const norm = document.getElementById(`norm-${itemId}`).value;
    const qty = document.getElementById(`qty-${itemId}`).value;
    const unit = document.getElementById(`unit-${itemId}`).value;
    const prodId = document.getElementById(`prod-${itemId}`).value;
    const resolved = document.getElementById(`res-${itemId}`).checked;

    try {
      await api.updateReviewItem(this.currentOrderId, itemId, {
        normalized_name: norm,
        quantity: parseFloat(qty),
        unit,
        matched_product_id: prodId || null,
        needs_review: !resolved,
        review_reason: resolved ? null : undefined
      });
      App.showToast('Item atualizado com sucesso!', 'success');
      this.render(document.getElementById('contentContainer'), this.currentOrderId);
    } catch (err) {
      App.showToast(`Erro ao salvar item: ${err.message}`, 'error');
    }
  },

  async handleDeleteItem(itemId) {
    if (!confirm('Deseja realmente remover este item do pedido?')) return;
    try {
      await api.deleteReviewItem(this.currentOrderId, itemId);
      App.showToast('Item removido.', 'success');
      this.render(document.getElementById('contentContainer'), this.currentOrderId);
    } catch (err) {
      App.showToast(`Erro: ${err.message}`, 'error');
    }
  },

  async handleApprove() {
    if (!confirm('Deseja aprovar este pedido e encaminhar a lista de materiais para cotação com fornecedores?')) return;
    try {
      const res = await api.approveOrder(this.currentOrderId, { createQuotation: true });
      App.showToast('Pedido aprovado com sucesso! Cotação gerada.', 'success');
      if (res.quotation && res.quotation.quotation_id) {
        App.navigateTo('quotations', res.quotation.quotation_id);
      } else {
        App.navigateTo('orders');
      }
    } catch (err) {
      App.showToast(`Erro ao aprovar: ${err.message}`, 'error');
    }
  },

  async handleReject() {
    const reason = prompt('Informe o motivo da rejeição do pedido:');
    if (!reason) return;
    try {
      await api.rejectOrder(this.currentOrderId, reason);
      App.showToast('Pedido rejeitado.', 'warning');
      App.navigateTo('orders');
    } catch (err) {
      App.showToast(`Erro: ${err.message}`, 'error');
    }
  },

  openAddItemModal() {
    const norm = prompt('Descrição do material a adicionar:');
    if (!norm) return;
    const qty = prompt('Quantidade:', '1');
    if (!qty) return;

    api.addReviewItem(this.currentOrderId, {
      normalized_name: norm,
      quantity: parseFloat(qty) || 1,
      unit: 'PC'
    }).then(() => {
      App.showToast('Item adicionado.', 'success');
      this.render(document.getElementById('contentContainer'), this.currentOrderId);
    }).catch(err => {
      App.showToast(`Erro: ${err.message}`, 'error');
    });
  }
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
