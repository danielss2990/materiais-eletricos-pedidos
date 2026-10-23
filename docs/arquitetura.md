# Arquitetura de Referência do Sistema
## Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

---

## 1. Visão Geral da Arquitetura

O sistema é construído sobre uma arquitetura desacoplada, orientada a serviços e eventos, com foco em resiliência, tolerância a falhas e transparência para o usuário interno.

```
                    +------------------------------------------+
                    |           CANAIS DE ENTRADA              |
                    +------------------------------------------+
                     |                 |                      |
             [WhatsApp Business]   [E-mail IMAP]      [Entrada Manual /]
             (Coexistência Meta)  (Deduplicação)      [Upload Arquivos ]
                     |                 |                      |
                     v                 v                      v
        +--------------------------------------------------------------+
        |                 CAMADA DE CONECTORES & WEBHOOKS              |
        |  - Verificação criptográfica de assinatura (HMAC-SHA256)     |
        |  - Validação de idempotência (wam_id / Message-ID)           |
        |  - Download seguro e hashing SHA-256 de anexos              |
        +--------------------------------------------------------------+
                                       |
                                       v
        +--------------------------------------------------------------+
        |                  FILA ASSÍNCRONA DE TAREFAS                  |
        |  - Isolamento de falhas (falha de IA não perde mensagem)     |
        |  - Retentativas com backoff exponencial                      |
        |  - Estado transacional no banco relacional                   |
        +--------------------------------------------------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
        +-------------------------+       +----------------------------+
        | SERVIÇO DE PROCESSAMENTO|       | MOTOR MULTIMODAL DE IA     |
        |       DE ARQUIVOS       |       |  - Normalização de jargões |
        |  - OCR de listas        | <---> |  - Detecção de ambiguidades|
        |  - Transcrição de áudio |       |  - Extração de quantidades |
        |  - Extração de PDFs     |       |  - Associação ao catálogo  |
        +-------------------------+       +----------------------------+
                                       |
                                       v
        +--------------------------------------------------------------+
        |                      BANCO DE DADOS                          |
        |  - SQLite (desenvolvimento local, sem dependências externas) |
        |  - PostgreSQL (ambiente corporativo compartilhado)           |
        +--------------------------------------------------------------+
                                       ^
                                       | REST API (Tokens de Sessão)
        +--------------------------------------------------------------+
        |                     APLICAÇÃO WEB INTERNA                    |
        |  - Painel de Visão Geral (KPIs em tempo real)                |
        |  - Gestão e Triagem de Pedidos                               |
        |  - Revisão Humana em Tela Dividida (Split-Screen)            |
        |  - Catálogo de Materiais Elétricos com Sinônimos             |
        |  - Módulo de Cotações e Comparação de Fornecedores           |
        |  - Painel de Conectores e Diagnóstico                        |
        |  - Relatórios Gerenciais e Auditoria                         |
        +--------------------------------------------------------------+
```

---

## 2. Princípios de Projeto

1. **Preservação dos Canais Comerciais:** Nenhuma modificação na experiência do cliente tradicional. Os clientes continuam enviando mensagens e áudios para os números e e-mails que já utilizam.
2. **Separação Rígida entre Backend e Frontend:** Nenhuma chave de API ou credencial sensível é exposta ao navegador. Toda a comunicação ocorre via endpoints autenticados.
3. **Idempotência de Ingestão:** Webhooks duplicados ou múltiplos polls de e-mail são descartados sem gerar pedidos repetidos.
4. **Resiliência da Mensagem Bruta:** A mensagem original e os arquivos brutos são persistidos imediatamente antes de qualquer chamada externa de IA. Falhas na IA não causam perda de dados.
5. **Revisão Humana Obrigatória:** Na primeira versão, nenhuma cotação é enviada automaticamente sem validação expressa e aprovação de um funcionário.
6. **Conformidade com a LGPD:** Tratamento estrito de dados pessoais comerciais, com logs de auditoria e retenção controlada.

---

## 3. Especificação dos Módulos

### 3.1. Conector WhatsApp Business (Coexistência)
- Endpoint: `POST /api/webhooks/whatsapp`
- Autenticação de Webhook:
  - Verificação de handshake `GET` via `hub.challenge` e `hub.verify_token`.
  - Verificação de assinatura `POST` via cabeçalho `X-Hub-Signature-256` utilizando chave HMAC-SHA256 compartilhada.
- Deduplicação: Verificação de unicidade do identificador `wam_id` na tabela `messages`.
- Eventos de Vendedor (`smb_message_echoes`): Registro histórico de mensagens enviadas pelo próprio funcionário através do app móvel.

### 3.2. Conector WhatsApp Pessoal (Informativo e Contingencial)
- Exibe status `UNAVAILABLE_OFFICIAL_API` com esclarecimento técnico e legal.
- Interface web fornece formulário assistido para que o vendedor transfira ou faça upload de mensagens recebidas em seu número pessoal.

### 3.3. Conector de E-mail Comercial
- Conexão IMAP sobre TLS (`port 993`) ou ingestão simulada via Webhook.
- Deduplicação via cabeçalho `Message-ID`.
- Parser MIME para separação de texto limpo, HTML e decodificação base64 de anexos.

### 3.4. Motor Multimodal de IA e Regras Elétricas
- Motor modular com interface unificada (`aiEngine.js`):
  - Suporte a provedores externos (Google Gemini, OpenAI).
  - Motor local determinístico/heurístico embutido para execução autônoma sem custo e offline.
- Regras Elétricas (`electricalRules.js`):
  - Normalização de expressões como *"fio de duas e meia"*, *"passa-fio"*, *"rabicho"*, *"disjuntor de 20"*.
  - Detecção ativa de ambiguidades técnicas (ex.: bitola não informada, cor do condutor ausente, curva de disparo de disjuntor indefinida, tensão 127V vs. 220V).
  - Sugestão de correspondência com o catálogo com score de confiança calibrado.
- Schema JSON estrito validado a cada processamento.

### 3.5. Fila Assíncrona de Processamento
- Fila transacional no banco de dados (`processing_tasks`).
- Estados: `QUEUED` -> `PROCESSING` -> `COMPLETED` ou `FAILED`.
- Mecanismo de retry automático com limite de tentativas configurável e registro detalhado de erro.

### 3.6. Módulo de Cotação e Comparação de Fornecedores
- Transformação de itens de pedidos aprovados em `quotations`.
- Cadastro de fornecedores com condições de pagamento e prazos.
- Entrada de propostas e mapa de cotação comparativo:
  - Destaque automático do menor preço por item.
  - Análise de prazo de entrega e disponibilidade de estoque.
  - Exportação nos formatos CSV e JSON estruturados.

---

## 4. Segurança e LGPD

1. **Controle de Acesso Baseado em Papéis (RBAC):**
   - Papéis: `ADMIN`, `ATTENDANT` (Atendente), `QUOTATION_ANALYST` (Analista de Cotação).
2. **Proteção de Anexos:**
   - Os arquivos são gravados em diretório privado (`storage/attachments/`) com permissões restritas.
   - O acesso aos arquivos ocorre unicamente através da rota autenticada `/api/files/:id`, garantindo que apenas usuários logados acessem orçamentos e fotos.
3. **Trilha de Auditoria (`audit_logs`):**
   - Todas as ações críticas (aprovação de itens, edição de quantidades, alteração de status de cotação, cadastro de fornecedor) geram registros com `user_id`, `action`, `old_values`, `new_values` e `timestamp`.
4. **Isolamento de Dados de Clientes:**
   - Os orçamentos de um cliente não são visíveis para outros clientes nem compartilhados externamente.
