// Relatórios, Métricas de IA e Trilha de Auditoria LGPD
const ReportsView = {
  async render(container) {
    container.innerHTML = `<div class="loading">Carregando relatórios e auditoria...</div>`;

    try {
      const [kpiData, historyData, auditData] = await Promise.all([
        api.getKpis(),
        api.getHistory(),
        api.getAuditLogs().catch(() => ({ logs: [] }))
      ]);

      const k = kpiData.kpis;
      const history = historyData.history || [];
      const logs = auditData.logs || [];

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">Relatórios Gerenciais & Auditoria LGPD</h2>
          <p style="font-size: 13px; color: var(--text-muted);">
            Métricas de produtividade, taxa de intervenção humana, estimativa de custos operacionais e rastreabilidade inalterável.
          </p>
        </div>

        <div class="grid-cols-4">
          <div class="card">
            <div class="kpi-title">Taxa de Revisão Humana</div>
            <div class="kpi-value">${k.humanReviewRate}</div>
            <div class="kpi-sub">${k.reviewedItems} de ${k.totalItems} materiais precisaram de conferência</div>
          </div>
          <div class="card">
            <div class="kpi-title">Estimativa de Tokens IA</div>
            <div class="kpi-value">${k.estimatedTokens.toLocaleString('pt-BR')}</div>
            <div class="kpi-sub">Média de 600 tokens/pedido processado</div>
          </div>
          <div class="card">
            <div class="kpi-title">Custo Estimado IA (USD)</div>
            <div class="kpi-value" style="color: #059669;">$${k.estimatedCostUsd.toFixed(4)}</div>
            <div class="kpi-sub">Baseado na tabela oficial Gemini 1.5 Flash</div>
          </div>
          <div class="card">
            <div class="kpi-title">Taxa de Sucesso da IA</div>
            <div class="kpi-value" style="color: #059669;">
              ${(k.completedTasks + k.failedTasks) > 0 ? Math.round((k.completedTasks / (k.completedTasks + k.failedTasks)) * 100) : 100}%
            </div>
            <div class="kpi-sub">${k.completedTasks} concluídas com sucesso</div>
          </div>
        </div>

        <div class="table-container" style="margin-bottom: 24px;">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">Volumetria de Pedidos por Canal e Período</h3>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Total do Dia</th>
                <th>WhatsApp Business (Coex)</th>
                <th>E-mail Comercial</th>
                <th>Entrada Manual & Upload</th>
              </tr>
            </thead>
            <tbody>
              ${history.length === 0 ? `
                <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum histórico registrado no período.</td></tr>
              ` : history.map(h => `
                <tr>
                  <td><strong>${new Date(h.date + 'T00:00:00').toLocaleDateString('pt-BR')}</strong></td>
                  <td><strong>${h.order_count} pedidos</strong></td>
                  <td><span class="badge badge-whatsapp">${h.whatsapp_count || 0}</span></td>
                  <td><span class="badge badge-email">${h.email_count || 0}</span></td>
                  <td><span class="badge badge-manual">${h.manual_count || 0}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="table-container">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">Trilha de Auditoria & Conformidade LGPD</h3>
            <span style="font-size: 12px; color: var(--text-muted);">Registro inalterável de ações de funcionários</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Operador / Usuário</th>
                <th>Ação Executada</th>
                <th>Entidade</th>
                <th>IP de Origem</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum log de auditoria disponível ou permissão restrita a administradores.</td></tr>
              ` : logs.map(l => `
                <tr>
                  <td>${new Date(l.created_at).toLocaleString('pt-BR')}</td>
                  <td><strong>${escapeHtml(l.user_name || l.user_id || 'Sistema')}</strong></td>
                  <td><code>${escapeHtml(l.action)}</code></td>
                  <td>${escapeHtml(l.entity_type)} (${escapeHtml(l.entity_id)})</td>
                  <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(l.ip_address || '127.0.0.1')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Erro: ${escapeHtml(err.message)}</div>`;
    }
  }
};
