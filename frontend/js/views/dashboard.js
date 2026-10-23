// Visão Geral (Dashboard)
const DashboardView = {
  async render(container) {
    container.innerHTML = `<div class="loading">Carregando indicadores...</div>`;

    try {
      const [kpiData, ordersData] = await Promise.all([
        api.getKpis(),
        api.getOrders({ limit: 8 })
      ]);

      const k = kpiData.kpis;
      const channels = kpiData.byEntryMethod || [];

      container.innerHTML = `
        <div class="grid-cols-4">
          <div class="card">
            <div class="kpi-title">Volume Total de Pedidos</div>
            <div class="kpi-value">${k.totalOrders}</div>
            <div class="kpi-sub">Total acumulado processado</div>
          </div>
          <div class="card" style="border-left: 4px solid var(--warning);">
            <div class="kpi-title">Pendentes de Revisão</div>
            <div class="kpi-value" style="color: #b45309;">${k.pendingReview}</div>
            <div class="kpi-sub">Aguardando validação humana</div>
          </div>
          <div class="card" style="border-left: 4px solid var(--success);">
            <div class="kpi-title">Prontos para Cotação</div>
            <div class="kpi-value" style="color: #059669;">${k.inQuotation}</div>
            <div class="kpi-sub">Itens aprovados no fluxo comercial</div>
          </div>
          <div class="card">
            <div class="kpi-title">Taxa de Intervenção Humana</div>
            <div class="kpi-value">${k.humanReviewRate}</div>
            <div class="kpi-sub">${k.reviewedItems} de ${k.totalItems} itens com ambiguidades</div>
          </div>
        </div>

        <div class="grid-cols-3">
          <div class="card">
            <div class="kpi-title">Origem dos Pedidos (Canais)</div>
            <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px;">
              ${channels.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                  <span>${formatChannelName(c.entry_method)}</span>
                  <strong>${c.count} pedidos</strong>
                </div>
              `).join('') || '<div style="font-size: 12px; color: var(--text-muted);">Nenhum pedido registrado ainda.</div>'}
            </div>
          </div>

          <div class="card">
            <div class="kpi-title">Confiabilidade & IA</div>
            <div style="margin-top: 14px; font-size: 13px; display: flex; flex-direction: column; gap: 8px;">
              <div>Tarefas Concluídas com Sucesso: <strong>${k.completedTasks}</strong></div>
              <div>Falhas de IA Recuperadas: <strong>${k.failedTasks}</strong></div>
              <div>Tokens Estimados: <strong>${k.estimatedTokens.toLocaleString('pt-BR')}</strong></div>
              <div>Custo Estimado IA: <strong>$${k.estimatedCostUsd.toFixed(4)} USD</strong></div>
            </div>
          </div>

          <div class="card">
            <div class="kpi-title">Regras Comerciais & Clientes</div>
            <div style="margin-top: 10px; font-size: 12.5px; color: var(--text-muted); line-height: 1.6;">
              <p>✓ <strong>Preservação de Canais:</strong> Nenhum cliente é obrigado a mudar seu hábito.</p>
              <p>✓ <strong>Coexistência Meta:</strong> Celular do vendedor permanece ativo sem risco de banimento.</p>
              <p>✓ <strong>Revisão Humana:</strong> Validação obrigatória antes do envio de cotações.</p>
            </div>
          </div>
        </div>

        <div class="table-container">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">Últimas Solicitações Recebidas</h3>
            <a href="#orders" class="btn btn-secondary btn-sm">Ver Todos os Pedidos</a>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Itens</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${ordersData.orders.map(o => `
                <tr>
                  <td><strong>${o.order_code}</strong></td>
                  <td>${o.client_name || 'Cliente Balcão'}</td>
                  <td>${renderChannelBadge(o.entry_method)}</td>
                  <td>${renderStatusBadge(o.status)}</td>
                  <td>${o.item_count || 0} material(is) ${o.review_count > 0 ? `<span style="color:#b45309; font-weight:600;">(${o.review_count} pendência)</span>` : ''}</td>
                  <td>${new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" onclick="App.navigateTo('review', '${o.id}')">Revisar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Erro ao carregar painel: ${err.message}</div>`;
    }
  }
};

function formatChannelName(method) {
  switch (method) {
    case 'AUTOMATIC_WHATSAPP': return '🟢 WhatsApp Business (Coexistência)';
    case 'AUTOMATIC_EMAIL': return '🔵 E-mail Comercial (IMAP)';
    case 'MANUAL_ENTRY': return '🟡 Entrada Manual Assistida';
    case 'FILE_IMPORT': return '🟣 Importação de Arquivos / Mídia';
    default: return method;
  }
}

function renderChannelBadge(method) {
  switch (method) {
    case 'AUTOMATIC_WHATSAPP': return '<span class="badge badge-whatsapp">WhatsApp</span>';
    case 'AUTOMATIC_EMAIL': return '<span class="badge badge-email">E-mail</span>';
    case 'MANUAL_ENTRY': return '<span class="badge badge-manual">Manual</span>';
    case 'FILE_IMPORT': return '<span class="badge badge-upload">Upload</span>';
    default: return `<span class="badge">${method}</span>`;
  }
}

function renderStatusBadge(status) {
  switch (status) {
    case 'PENDING_REVIEW': return '<span class="badge badge-pending">Pendente Revisão</span>';
    case 'PROCESSING': return '<span class="badge badge-processing">Processando IA</span>';
    case 'APPROVED': return '<span class="badge badge-approved">Aprovado</span>';
    case 'IN_QUOTATION': return '<span class="badge badge-quotation">Em Cotação</span>';
    case 'QUOTED': return '<span class="badge badge-approved">Cotado</span>';
    case 'REJECTED': return '<span class="badge badge-rejected">Rejeitado</span>';
    default: return `<span class="badge">${status}</span>`;
  }
}
