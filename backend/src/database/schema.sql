-- ============================================================================
-- SCHEMA RELACIONAL: SISTEMA DE PROCESSAMENTO DE PEDIDOS DE MATERIAIS ELÉTRICOS
-- Compatível com SQLite 3 (node:sqlite) e PostgreSQL 12+
-- ============================================================================

-- 1. CLIENTES (Instaladores, Empreiteiros, Eletricistas, Construtoras)
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    document TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CANAIS E CONTAS CONECTADAS
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'WHATSAPP_BUSINESS', 'WHATSAPP_PERSONAL', 'EMAIL', 'MANUAL_ENTRY'
    name TEXT NOT NULL,
    identifier TEXT NOT NULL, -- Telefone E.164 ou E-mail
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'PENDING_CONFIG', 'UNAVAILABLE_OFFICIAL', 'ERROR'
    config_json TEXT, -- Configurações e metadados de pareamento
    last_event_at TIMESTAMP,
    last_sync_at TIMESTAMP,
    error_details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. MENSAGENS BRUTAS RECEBIDAS
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    external_id TEXT UNIQUE, -- wam_id (Meta) ou Message-ID (RFC 5322) para deduplicação
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    recipient_id TEXT,
    direction TEXT NOT NULL DEFAULT 'INBOUND', -- 'INBOUND', 'OUTBOUND'
    content_type TEXT NOT NULL DEFAULT 'TEXT', -- 'TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'MIXED'
    raw_payload TEXT,
    raw_text TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels (id)
);

-- 4. ANEXOS (Fotos de listas, bilhetes manuscritos, áudios, PDFs)
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    order_id TEXT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'STORED', -- 'STORED', 'PROCESSING', 'EXTRACTED', 'FAILED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages (id),
    FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- 5. PRODUTOS / CATÁLOGO INTERNO DE MATERIAIS ELÉTRICOS
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    technical_description TEXT NOT NULL,
    synonyms_array TEXT NOT NULL DEFAULT '[]', -- JSON array com dialetos de busca
    default_unit TEXT NOT NULL DEFAULT 'PC', -- 'M', 'ROLO_100M', 'PC', 'BARRA_3M', 'CX'
    category TEXT NOT NULL, -- 'CONDUTORES', 'PROTECAO_E_COMANDO', 'ELETRODUTOS', 'ILUMINACAO', 'ACESSORIOS'
    specifications_json TEXT DEFAULT '{}',
    min_stock INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SOLICITAÇÕES / PEDIDOS
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_code TEXT UNIQUE NOT NULL,
    client_id TEXT,
    message_id TEXT,
    channel_id TEXT,
    entry_method TEXT NOT NULL, -- 'AUTOMATIC_WHATSAPP', 'AUTOMATIC_EMAIL', 'MANUAL_ENTRY', 'FILE_IMPORT'
    status TEXT NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED', 'IN_QUOTATION', 'QUOTED', 'REJECTED'
    original_text TEXT NOT NULL,
    processed_data TEXT, -- JSON estruturado retornado pelo motor de IA
    review_notes TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id),
    FOREIGN KEY (message_id) REFERENCES messages (id),
    FOREIGN KEY (channel_id) REFERENCES channels (id)
);

-- 7. ITENS DO PEDIDO (Extraídos, Normalizados e Auditados)
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    original_text TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    technical_specs TEXT DEFAULT '{}',
    suggested_product_id TEXT,
    matched_product_id TEXT,
    confidence_score REAL DEFAULT 0.0,
    needs_review INTEGER DEFAULT 0,
    review_reason TEXT,
    missing_specs TEXT DEFAULT '[]', -- JSON array de características ausentes
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'EDITED', 'REJECTED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    FOREIGN KEY (suggested_product_id) REFERENCES products (id),
    FOREIGN KEY (matched_product_id) REFERENCES products (id)
);

-- 8. FORNECEDORES DE MATERIAIS ELÉTRICOS
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cnpj_cpf TEXT,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    payment_terms TEXT,
    delivery_days INTEGER DEFAULT 2,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. COTAÇÕES DE COMPRAS
CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    quotation_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'SENT_TO_SUPPLIERS', 'RECEIVED_PRICES', 'VALIDATED', 'SENT_TO_CLIENT'
    total_amount REAL DEFAULT 0.0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- 10. ITENS DA COTAÇÃO
CREATE TABLE IF NOT EXISTS quotation_items (
    id TEXT PRIMARY KEY,
    quotation_id TEXT NOT NULL,
    order_item_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    target_price REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE,
    FOREIGN KEY (order_item_id) REFERENCES order_items (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
);

-- 11. PROPOSTAS DOS FORNECEDORES
CREATE TABLE IF NOT EXISTS supplier_proposals (
    id TEXT PRIMARY KEY,
    quotation_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    proposal_code TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount REAL DEFAULT 0.0,
    payment_terms TEXT,
    delivery_deadline_days INTEGER,
    validity_date TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

-- 12. ITENS DA PROPOSTA DO FORNECEDOR
CREATE TABLE IF NOT EXISTS supplier_proposal_items (
    id TEXT PRIMARY KEY,
    supplier_proposal_id TEXT NOT NULL,
    quotation_item_id TEXT NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    brand_offered TEXT,
    availability TEXT DEFAULT 'PRONTA_ENTREGA', -- 'PRONTA_ENTREGA', 'SOB_ENCOMENDA', 'INDISPONIVEL'
    delivery_days INTEGER DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (supplier_proposal_id) REFERENCES supplier_proposals (id) ON DELETE CASCADE,
    FOREIGN KEY (quotation_item_id) REFERENCES quotation_items (id)
);

-- 13. FILA DE TAREFAS ASSÍNCRONAS (Processamento de Mídia, OCR, IA)
CREATE TABLE IF NOT EXISTS processing_tasks (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'ORDER', 'ATTACHMENT', 'MESSAGE'
    entity_id TEXT NOT NULL,
    task_type TEXT NOT NULL, -- 'OCR', 'AUDIO_TRANSCRIPTION', 'AI_EXTRACTION', 'CATALOG_MATCH'
    status TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    payload TEXT,
    result TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. USUÁRIOS DO SISTEMA (Funcionários internos)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'ATTENDANT', -- 'ADMIN', 'ATTENDANT', 'QUOTATION_ANALYST'
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. REGISTROS DE AUDITORIA (LGPD & Rastreabilidade de Edições)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES PARA OTIMIZAÇÃO DE BUSCA E PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages (external_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders (order_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_processing_tasks_status ON processing_tasks (status);
CREATE INDEX IF NOT EXISTS idx_quotations_order_id ON quotations (order_id);
