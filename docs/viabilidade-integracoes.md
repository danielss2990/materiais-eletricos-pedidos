# Auditoria Técnica e Comercial de Viabilidade de Integrações
## Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

**Data da Auditoria:** 20 de Outubro de 2026  
**Responsável Técnico:** Arquiteto de Software Sênior & Especialista em Integrações  
**Escopo:** Avaliação de viabilidade técnica, legal, operacional e de custos para recebimento automatizado de pedidos comerciais de materiais elétricos sem ruptura dos canais tradicionais da empresa.

---

## 1. Contexto e Premissa Comercial Inegociável

A distribuidora atende aproximadamente 50 solicitações diárias enviadas por instaladores, eletricistas, construtoras e empreiteiros através de números de WhatsApp históricos (muitos deles celulares de balcão ou números pessoais de vendedores) e e-mails corporativos.

A empresa tentou anteriormente impor canais centralizados ou formulários, e a base de clientes rejeitou categoricamente a mudança. Consequentemente:
- **Não é permitido obrigar os clientes a mudar de número, baixar aplicativo, preencher portal ou cadastrar login.**
- **A automação deve ser 100% voltada ao processamento interno.**
- **A integridade das contas de WhatsApp existentes é prioridade máxima:** nenhum método que exponha os números ao risco de banimento da Meta pode ser utilizado.

---

## 2. Matriz Comparativa de Viabilidade por Canal

| Critério | A. WhatsApp Pessoal (App Pessoal) | B. WhatsApp Business (App Standalone) | C. WhatsApp Business + Cloud API (Coexistência Oficial) | D. E-mail Comercial (IMAP / Exchange / Google) |
| :--- | :--- | :--- | :--- | :--- |
| **Integração Oficial Disponível?** | ❌ Não existe API oficial para WhatsApp Pessoal. | ❌ Não há API ou Webhooks nativos apenas com o app instalado. | ✅ **Sim**, via Meta Cloud API com Onboarding de Coexistência (*Coex*). | ✅ **Sim**, protocolos padrão (IMAP/TLS, POP3) e APIs (MS Graph, Gmail API). |
| **Recebimento Automático de Mensagens?** | ❌ Não oficial. | ❌ Apenas notificações locais no smartphone. | ✅ **Sim**, via Webhooks HTTPS em tempo real. | ✅ **Sim**, via polling IMAP periódico ou Webhook/Push (Graph/PubSub). |
| **Acesso a Texto e Metadados?** | ❌ Apenas na tela do aparelho. | ❌ Apenas na tela do aparelho. | ✅ **Sim** (`from`, `timestamp`, `message_id`, texto completo, contexto de resposta). | ✅ **Sim** (`Message-ID`, `From`, `To`, `Subject`, `Date`, corpo texto e HTML). |
| **Acesso e Download de Anexos?** | ❌ Impossível oficialmente. | ❌ Restrito à galeria do celular. | ✅ **Sim**, download autorizado de mídia via URL temporária da Graph API. | ✅ **Sim**, extração integral de MIME multiparts (PDF, JPEG, PNG, áudio, XLS). |
| **Suporte a Formatos Multimodais?** | Fotos, áudios e vídeos ficam retidos no celular. | Fotos, áudios e vídeos ficam retidos no celular. | ✅ **Fotos (JPEG/PNG), Áudios (OGG/MP3), Documentos (PDF), Vídeos (MP4)**. | ✅ **PDF, Imagens, Áudios anexados, Planilhas e Textos**. |
| **Risco de Banimento da Conta?** | 🔴 **CRÍTICO** se usado scraping/web emulado. | 🔴 **CRÍTICO** se usado scraping/web emulado. | 🟢 **ZERO RISCO**: solução homologada e suportada diretamente pela Meta. | 🟢 **ZERO RISCO**: uso padrão autorizado por credenciais corporativas. |
| **Impacto no Funcionário/Vendedor?** | Continua respondendo manualmente no aparelho. | Continua respondendo manualmente no aparelho. | 🟢 **Nenhum**: vendedor continua conversando pelo app no celular normalmente. | 🟢 **Nenhum**: atendente continua lendo e respondendo pelo Outlook/Webmail. |
| **Custo Direto de Plataforma?** | R$ 0 (mas inviável tecnicamente de forma segura). | R$ 0 (mas sem automação). | Gratuito para conversas iniciadas no app do celular; mensagens via API seguem tabela Meta. | R$ 0 adicionais (infraestrutura de e-mail existente). |

---

## 3. Análise Técnica Pormenorizada por Categoria

### Categoria A: Números Utilizados no Aplicativo WhatsApp Pessoal

#### 1. Diagnóstico de Viabilidade Oficial
A Meta Platforms Inc. **não disponibiliza e nunca disponibilizou nenhuma API, webhook ou mecanismo de acesso programático oficial para contas do aplicativo WhatsApp Pessoal (WhatsApp Messenger)**.

#### 2. Riscos de Métodos Não Autorizados (Scraping / Emulação de WhatsApp Web)
Existem ferramentas e bibliotecas abertas na comunidade (ex.: Baileys, WPPConnect, Venom, Puppeteer/Playwright acoplados ao WhatsApp Web) que tentam extrair sessões do WhatsApp Web.
- **Violação Contratual:** A Seção 4(b) e a Seção 5 dos Termos de Serviço do WhatsApp proíbem expressamente o uso de automação, scraping, engenharia reversa ou conexão de ferramentas não autorizadas aos servidores.
- **Mecanismos Anti-Fraude da Meta:** A Meta monitora padrões de tráfego, integridade do Web Crypto e eventos de telemetria do WhatsApp Web. Números que utilizam bibliotecas não oficiais são frequentemente desconectados e sofrem **bloqueio temporário ou banimento permanente e irreversível**.
- **Consequência Comercial:** Em um negócio tradicional onde clientes ligam e mandam mensagens para aquele número há anos, a perda do número por banimento representa dano financeiro e de reputação irreparável.

#### 3. Decisão Arquitetural e Estratégia de Contingência
- O conector para WhatsApp Pessoal será classificado no sistema com o status:  
  `UNAVAILABLE_OFFICIAL_API` ("Sem suporte a API oficial pela Meta").
- **Solução de Contingência Integrada:** Criamos um fluxo de entrada interna assistida:
  1. O vendedor que receber um pedido no seu WhatsApp pessoal pode utilizar o botão **"Importar Pedido Manualmente"** ou **"Upload de Arquivo / Áudio / Imagem"** no painel interno.
  2. A aplicação permite arrastar o arquivo de áudio encaminhado, a foto do bilhete manuscrito ou colar a mensagem de texto recebida.
  3. A inteligência artificial processa o material exatamente da mesma forma, gerando o pedido e a cotação.
  4. O pedido recebe a etiqueta de auditoria `MANUAL_ASSISTED_PERSONAL_WA`, garantindo transparência operacional sem violar as regras da Meta.

---

### Categoria B: Números Utilizados no WhatsApp Business Standalone (Sem API)

#### 1. Diagnóstico de Viabilidade
O aplicativo WhatsApp Business permite catálogo local, respostas rápidas e etiquetas no celular. Contudo, enquanto estiver desconectado da plataforma Cloud API, ele **não emite webhooks de saída** para servidores externos.

#### 2. Recomendação de Transição Suave
Qualquer número rodando WhatsApp Business standalone pode ser mantido como está, ou ser conectado ao mecanismo de **Coexistência da Meta** (detalhado na Categoria C), sem perder nenhuma conversa e sem obrigar o vendedor a largar o aparelho celular.

---

### Categoria C: Coexistência entre WhatsApp Business e WhatsApp Cloud API

#### 1. Diagnóstico e Mecânica de Funcionamento (Meta Coexistence / "Coex")
A Meta introduziu formalmente o recurso de **Coexistência** (WhatsApp Business App Users Onboarded to WhatsApp Business Platform / Cloud API).
- **Operação Simultânea:** O número comercial permanece ativo no aplicativo WhatsApp Business no smartphone do funcionário, ao mesmo tempo em que a instância da Cloud API é habilitada na Meta Business Platform.
- **Sincronização Bidirecional (`smb_message_echoes`):**
  - Quando um cliente envia um texto, foto, áudio ou documento para o número, a mensagem chega ao celular do funcionário **e** a Meta dispara um webhook `messages` para o backend da nossa aplicação.
  - Quando o funcionário responde diretamente pelo aplicativo no celular, a Meta dispara um webhook de evento `smb_message_echoes`, permitindo que o sistema registre a resposta e mantenha a linha do tempo do atendimento atualizada.
  - Eventos de sincronização de estado (`smb_app_state_sync`) informam leituras e interações.

#### 2. Metadados e Formatos de Mídia Suportados
A Cloud API disponibiliza através do payload JSON:
- `entry[].changes[].value.messages[]`:
  - `id`: identificador global único (`wam_id`), essencial para deduplicação idempotente.
  - `from`: número do cliente no formato E.164 (ex.: `5511999998888`).
  - `timestamp`: carimbo de data/hora oficial da Meta.
  - `type`: `text`, `image`, `audio`, `voice`, `video`, `document`, `location`, `contacts`.
  - Objetos de mídia com `id` e `mime_type` (ex.: `audio/ogg; codecs=opus`, `image/jpeg`, `application/pdf`).
- **Download Seguro de Mídias:**
  - O backend requisita `GET https://graph.facebook.com/v21.0/{media-id}` com o `Bearer {SYSTEM_USER_TOKEN}`.
  - A Meta retorna uma URL temporária com autorização de streaming.
  - O backend realiza o download e salva o arquivo em diretório privado e seguro, gerando hash SHA-256 para integridade.

#### 3. Requisitos e Pré-requisitos Oficiais da Meta
Para habilitar a Coexistência em uma conta comercial existente:
1. **Versão do Aplicativo:** O smartphone deve executar o WhatsApp Business App na versão **2.24.17 ou superior** (Android ou iOS).
2. **Onboarding via Embedded Signup v4:** O administrador acessa o fluxo de onboarding da Meta, insere o número existente do WhatsApp Business e recebe um código de validação de 6 dígitos **dentro do próprio aplicativo WhatsApp** no celular para autorizar o pareamento.
3. **Meta Business Manager & App:**
   - App configurado no Meta for Developers com as permissões `whatsapp_business_management` e `whatsapp_business_messaging`.
   - Webhook configurado com URL pública HTTPS válida e token de verificação (`hub.verify_token`).
   - Assinatura criptográfica dos eventos via cabeçalho `X-Hub-Signature-256` calculado com o `APP_SECRET`.
4. **Regra de Manutenção de Conexão:** O aplicativo no smartphone precisa ser aberto pelo menos uma vez a cada 13 dias para renovar as chaves de coexistência da Meta. Se o funcionário trocar de aparelho celular, o evento de webhook `ACCOUNT_OFFBOARDED` é recebido, e a reconexão automática (`ACCOUNT_RECONNECTED`) ocorre mediante confirmação no novo dispositivo.

#### 4. Custos e Dependências
- **Mensagens manuais enviadas pelo celular:** **Gratuitas** (não há cobrança de taxa de conversa da Meta para mensagens trocadas diretamente no app do WhatsApp Business).
- **Mensagens automáticas via Cloud API:** Sujeitas à tabela oficial da Meta de conversas de atendimento/serviço (com franquia mensal de 1.000 conversas gratuitas por mês por WABA). Como a nossa aplicação na Fase 1 opera em modo **apenas escuta/processamento interno com aprovação humana**, o envio de mensagens ativas é zero, resultando em **custo de Meta de R$ 0,00**.

---

### Categoria D: Caixas de E-mail Comerciais

#### 1. Diagnóstico de Viabilidade
A integração com e-mails comerciais (ex.: `pedidos@empresa.com.br`, `vendas@empresa.com.br` ou contas de e-mail específicas dos vendedores) possui viabilidade técnica plena e suportada por padrões internacionais consolidados.

#### 2. Protocolos e Mecanismos Disponíveis
- **IMAP sobre TLS (Porta 993 - RFC 3501 / RFC 9051):**
  - Compatível com qualquer servidor de e-mail (cPanel, Postfix, Zimbra, Locaweb, KingHost, etc.).
  - Leitura de mensagens não lidas (`UNSEEN`), busca de novas mensagens por data/ID.
  - Suporte a App Passwords (senhas de aplicativo) para serviços com duplo fator de autenticação.
- **APIs Modernas (Microsoft Graph API para Office 365 / Gmail API para Google Workspace):**
  - Autenticação moderna via OAuth 2.0 (Client Credentials ou Delegated Permissions).
  - Suporte a webhooks de notificação de push (Microsoft Graph Subscriptions ou Google Cloud Pub/Sub), eliminando a necessidade de polling contínuo.

#### 3. Metadados e Extração de Anexos
- Identificação unívoca via cabeçalho RFC 5322 `Message-ID` (garante idempotência e impede reprocessamento).
- Identificação de remetente (`From:` com nome e e-mail).
- Extração do corpo textual e alternativo (`text/plain` e `text/html`).
- Decodificação de anexos MIME base64:
  - PDFs com ordens de compra, relações de materiais e memoriais descritivos.
  - Imagens de orçamentos, fotos de peças elétricas ou bilhetes manuscritos.
  - Planilhas Excel (.xlsx) e CSVs.

#### 4. Requisitos de Segurança e LGPD
- **Nenhuma senha em texto puro no banco de dados:** Armazenamento seguro de credenciais em variáveis de ambiente ou cofre criptografado com chave simétrica AES-256-GCM.
- **Sanitização de Anexos:** Validação do MIME-type real através de magic numbers binários (prevenindo execução de scripts disfarçados de PDF/JPG).
- **Armazenamento Privado:** Anexos salvos em volume isolado com acesso exclusivo mediante token de sessão do funcionário logado.

---

## 4. Recomendações e Plano de Implantação

1. **WhatsApp Business Oficial:** Implementar o conector de Webhooks em total conformidade com a Meta Cloud API e Embedded Signup v4, com suporte a verificação de assinatura `X-Hub-Signature-256`, idempotência por `wam_id` e captura de áudios/imagens/documentos.
2. **WhatsApp Pessoal:** Declarar transparentemente no painel de Integrações que o número não permite captura automatizada por ausência de API oficial da Meta. Disponibilizar a entrada de contingência (upload de mídia ou texto colado).
3. **E-mail Comercial:** Implementar o conector IMAP/MIME seguro com verificação periódica ou simulação de webhook, extraindo anexos e prevenindo duplicidades por `Message-ID`.
4. **Independência Operacional:** O núcleo do sistema, a fila assíncrona, o motor de inteligência artificial e os módulos de cotação permanecem 100% operacionais mesmo que nenhum canal externo esteja configurado no momento da implantação inicial.

---

## 5. Referências e Fontes Oficiais

1. **Meta for Developers - Onboard WhatsApp Business App Users to WhatsApp Business Platform (Coexistence):**  
   https://developers.facebook.com/docs/whatsapp/cloud-api/coexistence
2. **Meta for Developers - WhatsApp Cloud API Webhooks & Messages Payload Reference:**  
   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
3. **WhatsApp Legal - Termos de Serviço do WhatsApp (Proibição de Scraping e Ferramentas Não Autorizadas):**  
   https://www.whatsapp.com/legal/terms-of-service
4. **Meta for Developers - Media Download Endpoint & Authorized Streaming:**  
   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
5. **IETF RFC 3501 (Internet Message Access Protocol - Version 4rev1) & RFC 5322 (Internet Message Format):**  
   https://datatracker.ietf.org/doc/html/rfc3501 | https://datatracker.ietf.org/doc/html/rfc5322
6. **Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD):**  
   Princípios de finalidade, necessidade e segurança da informação no tratamento de dados comerciais.
