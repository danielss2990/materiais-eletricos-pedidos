# Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

Aplicação empresarial funcional desenvolvida para distribuidora de materiais elétricos com recebimento diário (~50 solicitações/dia) via WhatsApp, e-mails comerciais, fotos de listas, áudios e mensagens de texto, sem alterar os hábitos ou números dos clientes tradicionais e automatizando a triagem, interpretação e cotação interna.

---

## ⚡ Como Executar a Aplicação

### 1. Pré-requisitos
- Node.js v22.13+ instalado (o projeto usa o módulo nativo `node:sqlite`; testado no Node.js v22.14.0 e v24.21.0).

### 2. Instalação (primeira vez)
No terminal, a partir da pasta raiz do projeto:
```bash
cd backend
npm install
cp .env.example .env
npm run seed
```
No Windows (CMD), use `copy .env.example .env` no lugar do `cp`.

O comando `npm run seed` cria o banco SQLite em `backend/data/` com usuários, catálogo e pedidos de exemplo. O banco não é versionado no Git.

### 3. Inicialização do Servidor Backend e Frontend
```bash
cd backend
npm start
```
A aplicação estará disponível em: **`http://localhost:3000`**

No Windows, também é possível dar dois cliques em `INICIAR_SISTEMA.bat`, que instala as dependências e popula o banco automaticamente na primeira execução.

**Usuários de demonstração** (criados pelo seed):

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `vendedor1` | `vendas123` | Atendimento |
| `analista1` | `cotacao123` | Cotações |

### 4. Execução da Suíte de Testes Automatizados
```bash
cd backend
npm test
```
Todos os 17 cenários de teste são validados de ponta a ponta com 100% de sucesso.

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
│   ├── data/                       # Banco SQLite local (gerado pelo seed, fora do Git)
│   ├── storage/
│   │   └── attachments/            # Armazenamento privado fora do web root público
│   ├── .env.example                # Modelo de variáveis de ambiente
│   └── package.json
├── frontend/
│   ├── index.html                  # Shell SPA com 7 áreas operacionais
│   ├── css/styles.css              # Design System corporativo e responsivo
│   └── js/
│       ├── api.js                  # Cliente REST autenticado
│       ├── app.js                  # Router SPA e controle de modais
│       └── views/                  # dashboard, orders, review (split-screen), catalog, quotations, integrations, reports
└── tests/
    └── runTests.js                 # 17 cenários automatizados obrigatórios
```

---

## 🔒 Auditoria de Viabilidade das Integrações
- **WhatsApp Pessoal:** Classificado como `UNAVAILABLE_OFFICIAL`. A Meta **não possui API oficial** para contas pessoais; scraping foi proibido para evitar banimento do número comercial. Disponibilizada entrada assistida no painel.
- **WhatsApp Business com Coexistência:** Suporte oficial via Meta Cloud API e Embedded Signup v4, permitindo que o vendedor continue utilizando o aplicativo móvel no smartphone e recebendo webhooks com sincronização bidirecional (`smb_message_echoes`).
- **E-mail Comercial:** Conector IMAP/TLS com deduplicação por RFC 5322 `Message-ID` e extração de anexos.
