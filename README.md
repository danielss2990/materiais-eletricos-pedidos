# Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

Aplicação empresarial funcional desenvolvida para distribuidora de materiais elétricos com recebimento diário (~50 solicitações/dia) via WhatsApp, e-mails comerciais, fotos de listas, áudios e mensagens de texto, sem alterar os hábitos ou números dos clientes tradicionais e automatizando a triagem, interpretação e cotação interna.

---

## ⚡ Como Executar a Aplicação

### 1. Pré-requisitos
- Node.js v20+ instalado (testado e homologado no Node.js v24.21.0).

### 2. Inicialização do Servidor Backend e Frontend
No terminal PowerShell ou CMD:
```bash
cd c:\Users\gusta\projetos\materiais-eletricos-pedidos\backend
node src/server.js
```
A aplicação estará disponível em: **`http://localhost:3000`**

O painel exige login. Os usuários de demonstração criados pelo seed (`npm run seed`) usam senhas fracas e conhecidas: troque-as antes de qualquer uso real.

### Segurança dos webhooks
Copie `backend/.env.example` para `backend/.env` e defina:
- `WEBHOOK_TOKEN`: exigido no cabeçalho `X-Webhook-Token` por `/api/webhooks/email` e `/api/webhooks/n8n/whatsapp`. Sem ele, só usuários logados podem chamar esses endpoints.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`: sem eles, o webhook da Meta rejeita todas as chamadas.

### 3. Execução da Suíte de Testes Automatizados
```bash
cd c:\Users\gusta\projetos\materiais-eletricos-pedidos
node tests/runTests.js
```
Todos os 16 cenários de teste são validados de ponta a ponta com 100% de sucesso.

---

## 📁 Estrutura do Projeto

```
materiais-eletricos-pedidos/
├── docs/
│   ├── viabilidade-integracoes.md   # Auditoria da Meta, Cloud API Coex, WA Pessoal e E-mail
│   ├── arquitetura.md              # Arquitetura modular, segurança e LGPD
│   └── banco-de-dados.md           # Modelagem relacional e guia de migração PostgreSQL
├── backend/
│   ├── src/
│   │   ├── config/index.js         # Configurações centralizadas
│   │   ├── database/               # node:sqlite nativo, schema.sql e seed.js
│   │   ├── services/
│   │   │   ├── ai/                 # aiEngine, promptTemplates, electricalRules, OCR, áudio
│   │   │   ├── connectors/         # WhatsApp Cloud API (Coex), WA Pessoal e E-mail
│   │   │   ├── queue/              # taskQueue assíncrona tolerante a falhas
│   │   │   ├── catalog/            # catalogMatcher com sinônimos e dialetos
│   │   │   └── quotation/          # quotationService e exportService (CSV/JSON)
│   │   ├── routes/                 # auth, orders, review, catalog, quotations, integrations, reports, webhooks
│   │   ├── middlewares/            # auth (RBAC), upload (multer), audit (LGPD)
│   │   └── server.js               # Servidor Express
│   └── package.json
├── frontend/
│   ├── index.html                  # Shell SPA com 7 áreas operacionais
│   ├── css/styles.css              # Design System corporativo e responsivo
│   └── js/
│       ├── api.js                  # Cliente REST autenticado
│       ├── app.js                  # Router SPA e controle de modais
│       └── views/                  # dashboard, orders, review (split-screen), catalog, quotations, integrations, reports
├── storage/
│   └── attachments/                # Armazenamento privado fora do web root público
└── tests/
    └── runTests.js                 # 16 cenários automatizados obrigatórios
```

---

## 🔒 Auditoria de Viabilidade das Integrações
- **WhatsApp Pessoal:** Classificado como `UNAVAILABLE_OFFICIAL`. A Meta **não possui API oficial** para contas pessoais; scraping foi proibido para evitar banimento do número comercial. Disponibilizada entrada assistida no painel.
- **WhatsApp Business com Coexistência:** Suporte oficial via Meta Cloud API e Embedded Signup v4, permitindo que o vendedor continue utilizando o aplicativo móvel no smartphone e recebendo webhooks com sincronização bidirecional (`smb_message_echoes`).
- **E-mail Comercial:** Conector IMAP/TLS com deduplicação por RFC 5322 `Message-ID` e extração de anexos.
