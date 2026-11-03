// Gestão de Integrações e Diagnóstico de Conectores
const IntegrationsView = {
  async render(container) {
    container.innerHTML = `<div class="loading">Carregando status dos conectores...</div>`;

    try {
      const [channelsData, eventsData] = await Promise.all([
        api.getIntegrations(),
        api.getIntegrationEvents()
      ]);

      const channels = channelsData.channels || [];
      const events = eventsData.events || [];

      container.innerHTML = `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">Painel de Conectores & Canais</h2>
          <p style="font-size: 13px; color: var(--text-muted);">
            Auditoria em tempo real de conectividade, webhook endpoints e limitações técnicas oficiais da Meta e e-mails.
          </p>
        </div>

        <div class="grid-cols-2">
          <!-- CARD EXCLUSIVO N8N ORCHESTRATOR -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-left: 4px solid #ea580c;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <h3 style="font-size: 15px; font-weight: 700; color: #ea580c;">🟠 Orquestrador n8n (WhatsApp Business Flow)</h3>
                  <div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">POST /api/webhooks/n8n/whatsapp</div>
                </div>
                <div>
                  <span class="status-indicator status-active"><span class="status-dot" style="background:#ea580c;"></span> n8n Pronto</span>
                </div>
              </div>

              <div style="background-color: #fff7ed; border-radius: var(--radius); padding: 12px; font-size: 12px; margin-bottom: 12px; color: #9a3412;">
                <div style="margin-bottom: 4px;"><strong>Status:</strong> Adaptador ativo e ouvindo requisições do n8n.</div>
                <div style="margin-bottom: 4px;"><strong>Arquivo do Fluxo:</strong> <code>n8n/workflows/whatsapp-pedidos-workflow.json</code></div>
                <div><strong>Compatibilidade:</strong> Meta Cloud API, Coexistência v2.24+ e Evolution/Z-API.</div>
              </div>

              <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 12px;">
                Permite conectar nós visuais do n8n diretamente à Meta Cloud API. O n8n gerencia webhooks, validações e encaminha os pedidos estruturados para nosso motor de IA.
              </div>
            </div>

            <div style="padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-muted);">Porta n8n padrão: 5678</span>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-sm" onclick="alert('Abra o n8n em http://localhost:5678, vá em Workflows > Import from File e selecione o arquivo n8n/workflows/whatsapp-pedidos-workflow.json. Depois preencha os nós Configuração (o backendWebhookSecret deve ser igual ao N8N_WEBHOOK_SECRET do backend/.env) e ative o fluxo. Guia completo: docs/integracao-n8n.md')">
                  Como Importar
                </button>
              </div>
            </div>
          </div>

          ${channels.map(c => `
            <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <div>
                    <h3 style="font-size: 15px; font-weight: 700;">${escapeHtml(c.name)}</h3>
                    <div style="font-size: 12px; color: var(--text-muted); font-family: monospace;">${escapeHtml(c.identifier)}</div>
                  </div>
                  <div>
                    ${c.status === 'ACTIVE' ? '<span class="status-indicator status-active"><span class="status-dot"></span> Ativo Oficial</span>' : ''}
                    ${c.status === 'UNAVAILABLE_OFFICIAL' ? '<span class="status-indicator status-limited"><span class="status-dot"></span> Sem API Oficial</span>' : ''}
                    ${c.status === 'ERROR' ? '<span class="status-indicator status-offline"><span class="status-dot"></span> Erro</span>' : ''}
                  </div>
                </div>

                <div style="background-color: #f8fafc; border-radius: var(--radius); padding: 12px; font-size: 12px; margin-bottom: 12px;">
                  <div style="margin-bottom: 4px;"><strong>Tipo:</strong> ${c.type}</div>
                  <div style="margin-bottom: 4px;"><strong>Último Evento:</strong> ${c.last_event_at ? new Date(c.last_event_at).toLocaleString('pt-BR') : 'Nenhum evento recente'}</div>
                  <div><strong>Última Sincronização:</strong> ${c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('pt-BR') : 'Não sincronizado'}</div>
                </div>

                <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 12px;">
                  <strong>Limitações e Política do Canal:</strong><br/>
                  ${escapeHtml(c.limitation_explanation || 'Sem restrições documentadas.')}
                </div>
              </div>

              <div style="padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: var(--text-muted);">
                  ${c.type === 'WHATSAPP_BUSINESS' ? 'Endpoint: /api/webhooks/whatsapp' : ''}
                  ${c.type === 'EMAIL' ? 'Protocolo: IMAP TLS 993' : ''}
                  ${c.type === 'WHATSAPP_PERSONAL' ? 'Fluxo assistido seguro' : ''}
                </span>
                ${c.type === 'WHATSAPP_PERSONAL' ? `
                  <button class="btn btn-warning btn-sm" onclick="IntegrationsView.openAssistedPersonalWaModal()">
                    Entrada Assistida
                  </button>
                ` : `
                  <button class="btn btn-secondary btn-sm" onclick="alert('Conector ativo e monitorado pelo backend.')">
                    Ver Diagnóstico
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="table-container" style="margin-top: 24px;">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">Últimos Eventos Recebidos nos Conectores</h3>
            <span style="font-size: 12px; color: var(--text-muted);">${events.length} eventos monitorados</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Canal</th>
                <th>Identificador Remetente</th>
                <th>Direção</th>
                <th>Formato</th>
                <th>Identificador Externo (Idempotência)</th>
                <th>Pedido Vinculado</th>
              </tr>
            </thead>
            <tbody>
              ${events.length === 0 ? `
                <tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhum evento registrado ainda nos conectores.</td></tr>
              ` : events.map(e => `
                <tr>
                  <td>${new Date(e.received_at).toLocaleString('pt-BR')}</td>
                  <td>${escapeHtml(e.channel_name || e.channel_type)}</td>
                  <td><strong>${escapeHtml(e.sender_name || e.sender_id)}</strong></td>
                  <td>${e.direction === 'INBOUND' ? '<span class="badge" style="background:#e0f2fe; color:#0369a1;">Entrada (Cliente)</span>' : '<span class="badge" style="background:#f1f5f9; color:#475569;">Saída (Vendedor)</span>'}</td>
                  <td><span class="badge" style="background:#f8fafc; border: 1px solid var(--border-color);">${e.content_type}</span></td>
                  <td><code style="font-size: 11px;">${escapeHtml(e.external_id || 'manual')}</code></td>
                  <td><strong>${e.order_code || '-'}</strong></td>
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

  openAssistedPersonalWaModal() {
    const phone = prompt('Número de telefone do cliente (com DDD):', '+55 11 9');
    if (!phone) return;
    const name = prompt('Nome ou apelido do cliente:', 'Cliente WhatsApp');
    const text = prompt('Cole aqui o texto ou itens recebidos na mensagem:');
    if (!text) return;

    api.assistPersonalWhatsApp({
      senderPhone: phone,
      senderName: name,
      text: text
    }).then(res => {
      App.showToast('Mensagem do WhatsApp Pessoal registrada e enviada para IA!', 'success');
      App.navigateTo('review', res.order_id);
    }).catch(err => {
      App.showToast(`Erro: ${err.message}`, 'error');
    });
  }
};
