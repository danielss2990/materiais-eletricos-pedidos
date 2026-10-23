// API Client Helper para a Aplicação Interna

const API_BASE = '/api';

const api = {
  getToken() {
    return localStorage.getItem('auth_token') || '';
  },

  setToken(token) {
    if (token) localStorage.setItem('auth_token', token);
    else localStorage.removeItem('auth_token');
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Se não autenticado e não for rota de login
      if (!endpoint.startsWith('/auth/login')) {
        console.warn('Sessão expirada ou não autenticado.');
      }
    }

    if (!response.ok) {
      let errMessage = `Erro HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errMessage = errorData.error || errMessage;
      } catch {
        // Ignora
      }
      throw new Error(errMessage);
    }

    // Se for download de arquivo blob
    if (options.asBlob) {
      return await response.blob();
    }

    return await response.json();
  },

  // Auth
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  getMe() {
    return this.request('/auth/me');
  },

  // Pedidos
  getOrders(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/orders?${params.toString()}`);
  },

  getOrder(id) {
    return this.request(`/orders/${id}`);
  },

  createManualOrder(data) {
    return this.request('/orders/manual', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  uploadOrderFiles(formData) {
    return this.request('/orders/upload', {
      method: 'POST',
      body: formData
    });
  },

  reprocessOrder(id) {
    return this.request(`/orders/${id}/reprocess`, {
      method: 'POST'
    });
  },

  // Revisão
  getReviewData(orderId) {
    return this.request(`/review/${orderId}`);
  },

  updateReviewItem(orderId, itemId, data) {
    return this.request(`/review/${orderId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  addReviewItem(orderId, data) {
    return this.request(`/review/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  deleteReviewItem(orderId, itemId) {
    return this.request(`/review/${orderId}/items/${itemId}`, {
      method: 'DELETE'
    });
  },

  approveOrder(orderId, data = {}) {
    return this.request(`/review/${orderId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  rejectOrder(orderId, reason) {
    return this.request(`/review/${orderId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Catálogo
  getCatalog(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/catalog?${params.toString()}`);
  },

  createProduct(data) {
    return this.request('/catalog', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  updateProduct(id, data) {
    return this.request(`/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  // Cotações
  getQuotations() {
    return this.request('/quotations');
  },

  getQuotation(id) {
    return this.request(`/quotations/${id}`);
  },

  getSuppliers() {
    return this.request('/quotations/suppliers');
  },

  createSupplier(data) {
    return this.request('/quotations/suppliers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  addSupplierProposal(quotationId, data) {
    return this.request(`/quotations/${quotationId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Integrações
  getIntegrations() {
    return this.request('/integrations');
  },

  getIntegrationEvents() {
    return this.request('/integrations/events');
  },

  assistPersonalWhatsApp(data) {
    return this.request('/integrations/whatsapp-personal/assist', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Relatórios
  getKpis() {
    return this.request('/reports/kpis');
  },

  getHistory() {
    return this.request('/reports/history');
  },

  getAuditLogs() {
    return this.request('/reports/audit');
  }
};
