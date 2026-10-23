# Modelagem de Banco de Dados e Guia de Migração
## Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

---

## 1. Visão Geral do Modelo de Dados

O banco de dados foi projetado segundo a terceira forma normal (3NF), com integridade referencial estrita, chaves primárias UUID/TEXT padronizadas, campos de auditoria (`created_at`, `updated_at`) e índices otimizados para busca de pedidos e conciliação de catálogos.

### Diagrama Entidade-Relacionamento (Conceitual)

```
 [channels] 1 --- * [messages] 1 --- * [attachments]
    |                    |
    |                    |
    | 1                  | 1
 [orders] <--------------+
    | 1
    |
    +--- * [order_items] * --- 1 [products]
    |
    +--- 1 [quotations] 1 --- * [quotation_items]
                                     |
                                     | 1
 [suppliers] 1 --- * [supplier_proposals] 1 --- * [supplier_proposal_items]

 [users] 1 --- * [audit_logs]
 [processing_tasks] (Fila transacional desacoplada)
```

---

## 2. Dicionário das Tabelas Principais

### `clients`
Registra os clientes da distribuidora (eletricistas, empreiteiras, empresas).
- `id` (TEXT, PK): Identificador unívoco.
- `name` (TEXT, NOT NULL): Nome ou razão social.
- `phone` (TEXT): Telefone / WhatsApp de contato.
- `email` (TEXT): E-mail cadastrado.
- `document` (TEXT): CPF ou CNPJ.
- `notes` (TEXT): Observações comerciais e preferências.
- `created_at` / `updated_at` (TIMESTAMP).

### `channels`
Registra as fontes de entrada e seu estado de conectividade.
- `id` (TEXT, PK)
- `type` (TEXT): `WHATSAPP_BUSINESS`, `WHATSAPP_PERSONAL`, `EMAIL`, `MANUAL_ENTRY`.
- `name` (TEXT): Rótulo amigável (ex.: "WhatsApp Vendas Loja", "E-mail Pedidos").
- `identifier` (TEXT): Número de telefone ou endereço de e-mail.
- `status` (TEXT): `ACTIVE`, `PENDING_CONFIG`, `UNAVAILABLE_OFFICIAL`, `ERROR`.
- `config_json` (TEXT): Parâmetros criptografados de configuração.
- `last_event_at` (TIMESTAMP): Data/hora do último evento recebido.
- `last_sync_at` (TIMESTAMP): Data/hora da última sincronização.
- `error_details` (TEXT): Detalhe do último erro ocorrido.

### `messages`
Registra mensagens brutas recebidas antes de qualquer transformação.
- `id` (TEXT, PK)
- `channel_id` (TEXT, FK -> channels.id)
- `external_id` (TEXT, UNIQUE): ID da Meta (`wam_id`) ou `Message-ID` do e-mail para deduplicação.
- `sender_id` (TEXT): Telefone ou e-mail de origem.
- `sender_name` (TEXT): Nome informado no canal.
- `recipient_id` (TEXT): Destinatário interno.
- `direction` (TEXT): `INBOUND` (recebido do cliente) ou `OUTBOUND` (enviado pelo funcionário).
- `content_type` (TEXT): `TEXT`, `IMAGE`, `AUDIO`, `DOCUMENT`, `MIXED`.
- `raw_payload` (TEXT): JSON original bruto do evento.
- `raw_text` (TEXT): Texto extraído ou corpo da mensagem.
- `received_at` (TIMESTAMP)

### `attachments`
Armazena referências a arquivos físicos (fotos de listas, áudios, PDFs).
- `id` (TEXT, PK)
- `message_id` (TEXT, FK -> messages.id)
- `order_id` (TEXT, FK -> orders.id)
- `filename` (TEXT): Nome original do arquivo.
- `file_path` (TEXT): Caminho seguro no sistema de arquivos.
- `mime_type` (TEXT): Tipo MIME verificado (ex.: `application/pdf`, `image/jpeg`).
- `file_size_bytes` (INTEGER)
- `sha256_hash` (TEXT): Hash para garantia de integridade e descarte de duplicatas.
- `processing_status` (TEXT): `STORED`, `PROCESSING`, `EXTRACTED`, `FAILED`.

### `orders`
Representa uma solicitação de materiais gerada a partir de uma mensagem ou entrada manual.
- `id` (TEXT, PK)
- `order_code` (TEXT, UNIQUE): Código humanamente legível (ex.: `PED-2026-0042`).
- `client_id` (TEXT, FK -> clients.id)
- `message_id` (TEXT, FK -> messages.id)
- `channel_id` (TEXT, FK -> channels.id)
- `entry_method` (TEXT): `AUTOMATIC_WHATSAPP`, `AUTOMATIC_EMAIL`, `MANUAL_ENTRY`, `FILE_IMPORT`.
- `status` (TEXT): `RECEIVED`, `PROCESSING`, `PENDING_REVIEW`, `APPROVED`, `IN_QUOTATION`, `QUOTED`, `REJECTED`.
- `original_text` (TEXT): Texto completo que originou o pedido.
- `processed_data` (TEXT): JSON estruturado com o resultado da interpretação da IA.
- `review_notes` (TEXT): Anotações do funcionário durante a revisão.
- `reviewed_by` (TEXT, FK -> users.id)
- `reviewed_at` (TIMESTAMP)

### `order_items`
Itens individuais extraídos e normalizados.
- `id` (TEXT, PK)
- `order_id` (TEXT, FK -> orders.id)
- `original_text` (TEXT): Texto bruto que gerou a linha (ex.: "2 rolo fio de duas e meia").
- `normalized_name` (TEXT): Nome padronizado (ex.: "Cabo de Cobre Flexível 2,5 mm² 750V").
- `quantity` (REAL)
- `unit` (TEXT): `M`, `ROLO_100M`, `PC`, `BARRA_3M`, `CX`.
- `technical_specs` (TEXT): JSON com voltagem, bitola, cor, curva, etc.
- `suggested_product_id` (TEXT, FK -> products.id)
- `matched_product_id` (TEXT, FK -> products.id): Produto formalmente aprovado pelo operador.
- `confidence_score` (REAL): Score estimado (0.0 a 1.0).
- `needs_review` (INTEGER): `1` se houver ambiguidade ou informação faltante, `0` se direto.
- `review_reason` (TEXT): Motivo detalhado (ex.: "Falta cor da isolação; confirmar se 100m ou metros avulsos").
- `missing_specs` (TEXT): Array JSON de características ausentes.
- `status` (TEXT): `PENDING`, `APPROVED`, `EDITED`, `REJECTED`.

### `products`
Catálogo interno de materiais elétricos da distribuidora.
- `id` (TEXT, PK)
- `sku` (TEXT, UNIQUE): Código do produto (ex.: `CAB-FLEX-2.5-AZ`).
- `name` (TEXT): Nome comercial.
- `technical_description` (TEXT): Descrição NBR / ABNT.
- `synonyms_array` (TEXT): JSON array com dialetos e variações de busca (ex.: `["fio 2.5", "cabo duas e meia", "fio de luz 2,5"]`).
- `default_unit` (TEXT)
- `category` (TEXT): `CONDUTORES`, `PROTECAO_E_COMANDO`, `ELETRODUTOS`, `ILUMINACAO`, `ACESSORIOS`.
- `specifications_json` (TEXT)
- `min_stock` (INTEGER)
- `active` (INTEGER): `1` para ativo, `0` para inativo.

### `suppliers`
Fornecedores cadastrados para cotação.
- `id` (TEXT, PK)
- `name` (TEXT): Nome do fornecedor / distribuidor fabricante.
- `cnpj_cpf` (TEXT)
- `contact_name` (TEXT)
- `phone` / `email` (TEXT)
- `payment_terms` (TEXT): Condições habituais (ex.: "28 DDL", "À vista com 5%").
- `delivery_days` (INTEGER): Prazo médio de entrega.
- `active` (INTEGER)

### `quotations` & `quotation_items`
Controle do ciclo de cotação de compras.
- Tabela `quotations`: código `COT-2026-0018`, status (`DRAFT`, `SENT_TO_SUPPLIERS`, `RECEIVED_PRICES`, `VALIDATED`, `SENT_TO_CLIENT`), observações e total.
- Tabela `quotation_items`: vínculo entre `quotation_id`, `order_item_id`, `product_id` e quantidade solicitada.

### `supplier_proposals` & `supplier_proposal_items`
Registro detalhado das propostas recebidas de cada fornecedor para comparação direta.
- `supplier_proposal_items`: preço unitário, total, marca ofertada (ex.: Sil, Cobrecom, Steck, Tigre), prazo e disponibilidade imediata.

### `processing_tasks`
Fila assíncrona de tarefas de IA e processamento de arquivos.
- `id` (TEXT, PK)
- `entity_type` (TEXT): `ORDER`, `ATTACHMENT`, `MESSAGE`.
- `entity_id` (TEXT)
- `task_type` (TEXT): `OCR`, `AUDIO_TRANSCRIPTION`, `AI_EXTRACTION`, `CATALOG_MATCH`.
- `status` (TEXT): `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `attempts` / `max_attempts` (INTEGER)
- `error_message` (TEXT)
- `payload` / `result` (TEXT): JSON com dados da tarefa e resultado obtido.

### `users` & `audit_logs`
Controle de operadores e trilha de conformidade LGPD.
- Registro de senhas com hashing criptográfico SHA-256 / bcrypt.
- Histórico inalterável de eventos com carimbo de tempo, usuário e detalhes da alteração.

---

## 3. Guia de Migração para PostgreSQL em Produção

Para ambientes de produção com múltiplos servidores ou alta concorrência:
1. **Tipos de Dados:**
   - Trocar `TEXT` com UUID por `UUID` nativo do PostgreSQL.
   - Trocar campos com JSON armazenados em `TEXT` por `JSONB` com índices GIN (`CREATE INDEX idx_products_synonyms ON products USING GIN ((synonyms_array::jsonb))`).
   - Trocar `TIMESTAMP` por `TIMESTAMPTZ` (com fuso horário UTC).
2. **Driver Node.js:**
   - Adicionar o pacote `pg` (`npm install pg`).
   - A camada de conexão do sistema (`backend/src/database/connection.js`) implementa o padrão *Repository/Database Adapter*, permitindo alternar entre `node:sqlite` e `pg` através da variável de ambiente `DATABASE_DRIVER=postgres` sem nenhuma alteração no código de negócio ou nas rotas.
