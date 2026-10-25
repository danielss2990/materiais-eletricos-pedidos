# Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

Aplicação empresarial funcional desenvolvida para distribuidora de materiais elétricos com recebimento diário (~50 solicitações/dia) via WhatsApp, e-mails comerciais, fotos de listas, áudios e mensagens de texto, sem alterar os hábitos ou números dos clientes tradicionais e automatizando a triagem, interpretação e cotação interna.

---

## ⚡ Como Executar a Aplicação

### 1. Pré-requisitos
- Node.js v20+ instalado (testado e homologado no Node.js v24.21.0).

### 2. Inicialização do Servidor Backend e Frontend
No terminal PowerShell ou CMD, a partir da pasta do projeto:
```bash
cd backend
npm ci
npm run seed
npm start
```
A aplicação estará disponível em: **`http://localhost:3000`**

O painel exige login. Os usuários de demonstração criados pelo seed (`npm run seed`) usam senhas fracas e conhecidas: troque-as antes de qualquer uso real.

### Segurança dos webhooks
Copie `backend/.env.example` para `backend/.env` e defina:
- `WEBHOOK_TOKEN`: exigido no cabeçalho `X-Webhook-Token` por `/api/webhooks/email` e `/api/webhooks/n8n/whatsapp`. Sem ele, só usuários logados podem chamar esses endpoints.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`: sem eles, o webhook da Meta rejeita todas as chamadas.

### 3. Execução da Suíte de Testes Automatizados
```bash
cd backend
npm test
```
O comando roda duas suítes, que também podem ser executadas separadamente:
- `npm run test:scenarios`: cenários de ponta a ponta do fluxo de pedidos (`tests/runTests.js`).
- `npm run test:security`: testes HTTP de segurança da API (`tests/security.test.js`), com banco e anexos isolados em diretório temporário.

Os testes também rodam automaticamente no GitHub Actions a cada pull request e a cada push na `main` (`.github/workflows/tests.yml`).

---

## 📁 Estrutura do Projeto

```
materiais-eletricos-pedidos/
├── .github/workflows/tests.yml     # CI: testes automáticos no GitHub Actions
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
│   │   ├── utils/security.js       # Hash de senhas, comparação segura e sanitização de arquivos
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
    ├── runTests.js                 # Cenários automatizados do fluxo de pedidos
    └── security.test.js            # Testes HTTP de segurança da API
```

---

## 🛡️ Melhorias de Segurança e Qualidade

Uma revisão de código encontrou falhas críticas e altas de segurança, corrigidas conforme abaixo.

### Falhas críticas corrigidas
| Problema | Correção |
|---|---|
| Requisições sem cabeçalho `Authorization` eram tratadas como ADMIN, e o ID do usuário (ex.: `usr_admin`) era aceito como token, pulando a checagem de perfil. | Toda rota protegida exige sessão válida; a checagem de perfil vale sempre; sessões expiram em 12 horas. |
| O nome de anexos vindos de e-mail e WhatsApp era usado direto no caminho do arquivo, permitindo gravar fora da pasta de anexos (inclusive sobrescrever o código do servidor). | Nomes são sanitizados (`safeFilename`) e o caminho final é validado dentro da pasta de anexos (`resolveInside`). |
| Os webhooks de e-mail e n8n não tinham autenticação, e o webhook da Meta usava um App Secret padrão público. | E-mail e n8n exigem o cabeçalho `X-Webhook-Token` (ou usuário logado). Os segredos padrão da Meta foram removidos: sem `WHATSAPP_APP_SECRET`, o webhook rejeita tudo. |

### Falhas altas corrigidas
| Problema | Correção |
|---|---|
| Nome do cliente, nome de anexos e outros dados externos eram inseridos no HTML sem escape (XSS armazenado). | Todos os dados dinâmicos das telas passam por `escapeHtml`. |
| Anexos eram servidos inline com o tipo informado pelo remetente (ex.: HTML ou SVG executando no domínio do sistema). | Apenas imagens comuns, PDF e áudio abrem inline; o restante é baixado como `application/octet-stream`, com `X-Content-Type-Options: nosniff` e CSP `sandbox`. Upload de SVG bloqueado. |
| Senhas armazenadas com SHA-256 sem salt. | Senhas com `scrypt` e salt aleatório; hashes antigos são aceitos e migrados automaticamente no próximo login. |

### Outras melhorias
- **Login no painel:** nova tela de login e botão "Sair". A sessão fica num cookie `HttpOnly` e `SameSite=Strict`, e o token não é mais guardado no `localStorage`.
- **Configuração:** `.env.example`, `SIMULAR_WHATSAPP.bat`, fluxo do n8n e documentação atualizados com `WEBHOOK_TOKEN`.
- **Testes automáticos:** nova suíte de segurança com 17 testes HTTP cobrindo autenticação, cookie de sessão, permissões, migração de senhas, webhooks, path traversal e download de anexos, executada no GitHub Actions junto com os cenários existentes.

### Pendências conhecidas (gravidade média)
- O código do pedido (`PED-AAAA-NNNN`) é calculado com `COUNT(*) + 1` e pode se repetir após exclusões ou requisições simultâneas.
- O total da listagem de pedidos ignora os filtros aplicados.
- Tarefas da fila que falham não são tentadas novamente, e tarefas interrompidas ficam presas em `PROCESSING`.
- Arquivos `database.sqlite-shm`/`-wal` e anexos de teste estão versionados no repositório.

---

## 🔒 Auditoria de Viabilidade das Integrações
- **WhatsApp Pessoal:** Classificado como `UNAVAILABLE_OFFICIAL`. A Meta **não possui API oficial** para contas pessoais; scraping foi proibido para evitar banimento do número comercial. Disponibilizada entrada assistida no painel.
- **WhatsApp Business com Coexistência:** Suporte oficial via Meta Cloud API e Embedded Signup v4, permitindo que o vendedor continue utilizando o aplicativo móvel no smartphone e recebendo webhooks com sincronização bidirecional (`smb_message_echoes`).
- **E-mail Comercial:** Conector IMAP/TLS com deduplicação por RFC 5322 `Message-ID` e extração de anexos.
