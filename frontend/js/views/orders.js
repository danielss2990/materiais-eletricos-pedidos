// Gestão e Lista de Pedidos
const OrdersView = {
  async render(container) {
    container.innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <div class="table-filters">
            <input type="text" id="orderSearch" class="search-input" placeholder="Buscar por código, cliente ou texto..." />
            <select id="channelFilter" class="select-input">
              <option value="">Todos os Canais</option>
              <option value="AUTOMATIC_WHATSAPP">WhatsApp Business (Coex)</option>
              <option value="AUTOMATIC_EMAIL">E-mail Comercial</option>
              <option value="MANUAL_ENTRY">Entrada Manual</option>
              <option value="FILE_IMPORT">Upload de Arquivos</option>
            </select>
            <select id="statusFilter" class="select-input">
              <option value="">Todos os Status</option>
              <option value="PENDING_REVIEW">Pendente de Revisão</option>
              <option value="PROCESSING">Processando IA</option>
              <option value="APPROVED">Aprovado</option>
              <option value="IN_QUOTATION">Em Cotação</option>
              <option value="REJECTED">Rejeitado</option>
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="App.openModal('uploadModal')">📤 Upload de Mídia / Áudio</button>
            <button class="btn btn-primary" onclick="App.openModal('manualOrderModal')">+ Novo Pedido</button>
          </div>
        </div>
        <div id="ordersTableWrapper">
          <div style="padding: 24px; text-align: center; color: var(--text-muted);">Carregando pedidos...</div>
        </div>
      </div>
    `;

    // Event listeners para filtros em tempo real
    const searchInput = document.getElementById('orderSearch');
    const channelFilter = document.getElementById('channelFilter');
    const statusFilter = document.getElementById('statusFilter');

    const loadOrders = async () => {
      try {
        const filters = {};
        if (searchInput.value) filters.search = searchInput.value;
        if (channelFilter.value) filters.entry_method = channelFilter.value;
        if (statusFilter.value) filters.status = statusFilter.value;

        const data = await api.getOrders(filters);
        const wrapper = document.getElementById('ordersTableWrapper');

        if (!data.orders || data.orders.length === 0) {
          wrapper.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--text-muted);">Nenhum pedido encontrado com os filtros selecionados.</div>`;
          return;
        }

        wrapper.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente / Contato</th>
                <th>Canal</th>
                <th>Status</th>
                <th>Itens Extraídos</th>
                <th>Anexos</th>
                <th>Recebido em</th>
                <th style="text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${data.orders.map(o => `
                <tr>
                  <td><strong>${escapeHtml(o.order_code)}</strong></td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(o.client_name || 'Cliente Balcão')}</div>
                    <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(o.client_phone || o.client_email || 'Sem contato')}</div>
                  </td>
                  <td>${renderChannelBadge(o.entry_method)}</td>
                  <td>${renderStatusBadge(o.status)}</td>
                  <td>
                    <span>${o.item_count || 0} item(ns)</span>
                    ${o.review_count > 0 ? `<div style="color: #b45309; font-size: 11.5px; font-weight: 600;">⚠️ ${o.review_count} com ambiguidade</div>` : ''}
                  </td>
                  <td>
                    ${o.attachment_count > 0 ? `<span class="badge" style="background:#e2e8f0;">📎 ${o.attachment_count} anexo(s)</span>` : '<span style="color:#94a3b8;">-</span>'}
                  </td>
                  <td>${new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-primary btn-sm" onclick="App.navigateTo('review', '${o.id}')">Revisar</button>
                    <button class="btn btn-secondary btn-sm" title="Reprocessar IA" onclick="OrdersView.handleReprocess('${o.id}')">🔄</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } catch (err) {
        document.getElementById('ordersTableWrapper').innerHTML = `<div style="padding: 20px; color: var(--danger);">Erro: ${escapeHtml(err.message)}</div>`;
      }
    };

    searchInput.addEventListener('input', debounce(loadOrders, 300));
    channelFilter.addEventListener('change', loadOrders);
    statusFilter.addEventListener('change', loadOrders);

    loadOrders();
  },

  async handleReprocess(orderId) {
    if (!confirm('Deseja reenviar este pedido para interpretação da IA?')) return;
    try {
      await api.reprocessOrder(orderId);
      App.showToast('Pedido enfileirado para reprocessamento!', 'success');
      setTimeout(() => App.renderCurrentView(), 600);
    } catch (err) {
      App.showToast(`Erro ao reprocessar: ${err.message}`, 'error');
    }
  }
};

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
