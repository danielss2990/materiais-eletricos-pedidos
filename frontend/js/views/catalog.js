// Gestão do Catálogo de Materiais Elétricos
const CatalogView = {
  async render(container) {
    container.innerHTML = `
      <div class="table-container">
        <div class="table-toolbar">
          <div class="table-filters">
            <input type="text" id="catalogSearch" class="search-input" placeholder="Buscar por SKU, nome ou sinônimo..." />
            <select id="catCategoryFilter" class="select-input">
              <option value="">Todas as Categorias</option>
              <option value="CONDUTORES">Cabos & Condutores</option>
              <option value="PROTECAO_E_COMANDO">Proteção & Disjuntores</option>
              <option value="ELETRODUTOS">Eletrodutos & Caixas</option>
              <option value="ACESSORIOS">Acessórios & Fitas</option>
              <option value="ILUMINACAO">Iluminação</option>
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="/api/catalog/export/csv" class="btn btn-secondary" target="_blank">📥 Exportar Catálogo (CSV)</a>
            <button class="btn btn-primary" onclick="CatalogView.openNewProductModal()">+ Novo Material</button>
          </div>
        </div>
        <div id="catalogTableWrapper">
          <div style="padding: 24px; text-align: center; color: var(--text-muted);">Carregando catálogo...</div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('catalogSearch');
    const categoryFilter = document.getElementById('catCategoryFilter');

    const loadCatalog = async () => {
      try {
        const filters = {};
        if (searchInput.value) filters.search = searchInput.value;
        if (categoryFilter.value) filters.category = categoryFilter.value;

        const data = await api.getCatalog(filters);
        const wrapper = document.getElementById('catalogTableWrapper');

        if (!data.products || data.products.length === 0) {
          wrapper.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--text-muted);">Nenhum produto encontrado.</div>`;
          return;
        }

        wrapper.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nome Comercial</th>
                <th>Categoria</th>
                <th>Unidade Padrão</th>
                <th>Sinônimos Cadastrados (Dialetos)</th>
                <th>Especificações</th>
                <th style="text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${data.products.map(p => `
                <tr>
                  <td><code>${p.sku}</code></td>
                  <td>
                    <strong>${escapeHtml(p.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.technical_description)}</div>
                  </td>
                  <td><span class="badge" style="background:#f1f5f9; color:#334155;">${p.category}</span></td>
                  <td><strong>${p.default_unit}</strong></td>
                  <td>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 280px;">
                      ${(p.synonyms || []).map(s => `<span class="badge" style="background:#eff6ff; color:#1e40af; font-size: 10.5px;">${escapeHtml(s)}</span>`).join('')}
                    </div>
                  </td>
                  <td>
                    <span style="font-size: 11.5px; color: var(--text-muted);">
                      ${Object.entries(p.specifications || {}).map(([k, v]) => `${k}: ${v}`).join(' | ') || '-'}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="CatalogView.openEditProductModal('${p.id}')">Editar</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } catch (err) {
        document.getElementById('catalogTableWrapper').innerHTML = `<div style="padding: 20px; color: var(--danger);">Erro: ${err.message}</div>`;
      }
    };

    searchInput.addEventListener('input', debounce(loadCatalog, 300));
    categoryFilter.addEventListener('change', loadCatalog);

    loadCatalog();
  },

  openNewProductModal() {
    const sku = prompt('Código SKU (ex: CAB-FLEX-10-AZ):');
    if (!sku) return;
    const name = prompt('Nome do Material:');
    if (!name) return;
    const desc = prompt('Descrição Técnica / Norma:', name);
    const synonymsRaw = prompt('Sinônimos de busca separados por vírgula (ex: fio 10, cabo de dez):', '');
    const synonyms = synonymsRaw ? synonymsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    api.createProduct({
      sku,
      name,
      technical_description: desc || name,
      synonyms,
      default_unit: 'PC',
      category: 'CONDUTORES'
    }).then(() => {
      App.showToast('Produto cadastrado com sucesso!', 'success');
      this.render(document.getElementById('contentContainer'));
    }).catch(err => {
      App.showToast(`Erro ao cadastrar produto: ${err.message}`, 'error');
    });
  },

  async openEditProductModal(productId) {
    const data = await api.getCatalog({ search: productId });
    const product = data.products.find(p => p.id === productId);
    if (!product) return;

    const newName = prompt('Nome Comercial:', product.name);
    if (!newName) return;
    const newSynonymsRaw = prompt('Sinônimos (separados por vírgula):', (product.synonyms || []).join(', '));
    const synonyms = newSynonymsRaw ? newSynonymsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
      await api.updateProduct(productId, {
        name: newName,
        synonyms
      });
      App.showToast('Produto atualizado!', 'success');
      this.render(document.getElementById('contentContainer'));
    } catch (err) {
      App.showToast(`Erro: ${err.message}`, 'error');
    }
  }
};
