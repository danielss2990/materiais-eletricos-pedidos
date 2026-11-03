// Aplicação Principal & Router
const App = {
  currentView: 'dashboard',
  currentParam: null,

  async init() {
    this.bindEvents();
    try {
      const { user } = await api.getMe();
      this.setUser(user);
      this.handleRoute();
    } catch {
      this.showLogin();
    }
  },

  setUser(user) {
    const roles = {
      ADMIN: 'Administrador',
      ATTENDANT: 'Atendimento & Vendas',
      QUOTATION_ANALYST: 'Cotações'
    };
    const name = user.fullName || user.username || '';
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    document.getElementById('userAvatar').innerText = initials || '--';
    document.getElementById('userName').innerText = name;
    document.getElementById('userRole').innerText = roles[user.role] || user.role || '';
  },

  showLogin() {
    document.getElementById('loginError').innerText = '';
    this.openModal('loginModal');
    document.getElementById('loginUsername').focus();
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      // Ignora: a sessão já pode ter expirado
    }
    document.getElementById('contentContainer').innerHTML = '';
    this.showLogin();
  },

  bindEvents() {
    window.addEventListener('hashchange', () => this.handleRoute());

    // Fechar modais ao clicar no overlay ou no botão fechar (exceto o login, que é obrigatório)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && overlay.id !== 'loginModal') {
          this.closeAllModals();
        }
      });
    });

    // Form de Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
          const { user } = await api.login(username, password);
          loginForm.reset();
          document.getElementById('loginModal').classList.remove('active');
          this.setUser(user);
          this.handleRoute();
        } catch (err) {
          document.getElementById('loginError').innerText = err.message;
        }
      });
    }

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Form de Pedido Manual
    const manualForm = document.getElementById('manualOrderForm');
    if (manualForm) {
      manualForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientName = document.getElementById('manualClientName').value;
        const clientPhone = document.getElementById('manualClientPhone').value;
        const text = document.getElementById('manualText').value;

        try {
          const res = await api.createManualOrder({ clientName, clientPhone, text });
          this.closeAllModals();
          manualForm.reset();
          this.showToast('Pedido manual criado com sucesso e enviado para IA!', 'success');
          this.navigateTo('review', res.order_id);
        } catch (err) {
          this.showToast(`Erro ao criar pedido: ${err.message}`, 'error');
        }
      });
    }

    // Form de Upload de Mídia / Contingência
    const uploadForm = document.getElementById('uploadOrderForm');
    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientName = document.getElementById('uploadClientName').value;
        const clientPhone = document.getElementById('uploadClientPhone').value;
        const text = document.getElementById('uploadNotes').value;
        const fileInput = document.getElementById('uploadFileInput');

        if (!fileInput.files || fileInput.files.length === 0) {
          alert('Por favor, selecione ao menos um arquivo de áudio, imagem ou PDF.');
          return;
        }

        const formData = new FormData();
        formData.append('clientName', clientName);
        formData.append('clientPhone', clientPhone);
        formData.append('text', text);
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append('files', fileInput.files[i]);
        }

        try {
          const res = await api.uploadOrderFiles(formData);
          this.closeAllModals();
          uploadForm.reset();
          this.showToast('Arquivos enviados com sucesso para análise multimodal da IA!', 'success');
          this.navigateTo('review', res.order_id);
        } catch (err) {
          this.showToast(`Erro no upload: ${err.message}`, 'error');
        }
      });
    }
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const parts = hash.split('/');
    const viewName = parts[0] || 'dashboard';
    const param = parts[1] || null;

    this.currentView = viewName;
    this.currentParam = param;

    // Atualiza menu ativo
    document.querySelectorAll('.nav-item').forEach(item => {
      const link = item.querySelector('a');
      if (link && link.getAttribute('href') === `#${viewName}`) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Atualiza título da barra superior
    const titleEl = document.getElementById('pageTitle');
    const titles = {
      dashboard: 'Visão Geral do Atendimento',
      orders: 'Gestão de Pedidos',
      review: 'Revisão Humana de Pedidos (Split-Screen)',
      catalog: 'Catálogo de Materiais Elétricos',
      quotations: 'Cotações com Fornecedores',
      integrations: 'Estado dos Conectores & Integrações',
      reports: 'Relatórios Gerenciais & Auditoria'
    };
    if (titleEl) titleEl.innerText = titles[viewName] || 'Painel';

    this.renderCurrentView();
  },

  navigateTo(view, param = null) {
    if (param) {
      window.location.hash = `#${view}/${param}`;
    } else {
      window.location.hash = `#${view}`;
    }
  },

  renderCurrentView() {
    const container = document.getElementById('contentContainer');
    if (!container) return;

    switch (this.currentView) {
      case 'dashboard':
        DashboardView.render(container);
        break;
      case 'orders':
        OrdersView.render(container);
        break;
      case 'review':
        ReviewView.render(container, this.currentParam);
        break;
      case 'catalog':
        CatalogView.render(container);
        break;
      case 'quotations':
        QuotationsView.render(container, this.currentParam);
        break;
      case 'integrations':
        IntegrationsView.render(container);
        break;
      case 'reports':
        ReportsView.render(container);
        break;
      default:
        DashboardView.render(container);
    }
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  },

  async simulateWhatsAppLive() {
    this.showToast('Simulando envio de mensagem de WhatsApp via n8n...', 'info');

    const sampleText = 'Carlos, boa tarde! Separa urgente pra nossa obra:\n- 2 rolos de fio de duas e meia azul\n- 4 disjuntores de 20 monopolar\n- 1 passa-fio\n- 10 caixinhas 4x2';

    try {
      const res = await api.request('/integrations/n8n/simulate', {
        method: 'POST',
        body: JSON.stringify({
          externalId: `wam_live_${Date.now()}`,
          senderPhone: '+55 11 98888-1234',
          senderName: 'Eng. Paulo (Obra Jardins)',
          messageType: 'TEXT',
          text: sampleText,
          timestamp: String(Math.floor(Date.now() / 1000))
        })
      });

      this.showToast(`✓ Mensagem de WhatsApp recebida ao vivo! Pedido ${res.order_code} gerado.`, 'success');

      // Aguarda 400ms para a fila assíncrona processar e abre a revisão
      setTimeout(() => {
        this.navigateTo('review', res.order_id);
      }, 500);
    } catch (err) {
      this.showToast(`Erro na simulação: ${err.message}`, 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
