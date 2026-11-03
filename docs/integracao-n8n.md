# Guia de Integração Oficial com o n8n para WhatsApp
## Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

---

## 1. Visão Geral da Integração

O **n8n** é uma plataforma de orquestração de fluxos baseada em nós que simplifica a captura, transformação e encaminhamento de eventos de mensageria.

Nesta arquitetura, o n8n atua como a **camada de ingestão do WhatsApp**: recebe os webhooks da Meta, valida a origem e repassa o evento original ao backend, que faz a interpretação.

```
 [Cliente WhatsApp]
         |
         v
 [Meta Cloud API / WhatsApp Business]
         | (Webhook HTTPS)
         v
 [n8n Workflow] (Porta 5678)
   ├─ GET  → Verificação do webhook (hub.verify_token / hub.challenge)
   └─ POST → 200 OK imediato para a Meta
             ├─ Validação da assinatura X-Hub-Signature-256
             ├─ Descarte de eventos sem mensagens (status de entrega/leitura)
             └─ HTTP Request -> POST /api/webhooks/n8n/whatsapp (com X-Webhook-Secret)
         |
         v
 [Backend Node.js - Sistema de Pedidos] (Porta 3000)
   ├─ Validação do segredo compartilhado (N8N_WEBHOOK_SECRET)
   ├─ Deduplicação Idempotente (wam_id)
   ├─ Download de fotos, áudios e documentos pela Cloud API
   ├─ Registro dos ecos do vendedor (Coexistência)
   ├─ Fila Assíncrona de Processamento (taskQueue)
   ├─ Motor Multimodal de IA (Normalização & Ambiguidade)
   └─ Tela de Revisão Humana (Split-Screen)
```

---

## 2. Arquivo do Workflow Pronto para Importação

O workflow está salvo e pronto para importação em:
📂 **`n8n/workflows/whatsapp-pedidos-workflow.json`**

### Ramo de verificação (GET)
1. **Webhook WhatsApp (Verificação Meta):** recebe o `GET` que a Meta envia ao cadastrar a Callback URL.
2. **Configuração (Verificação):** guarda o `verifyToken`.
3. **Validar Token de Verificação / Token Válido?:** confere `hub.mode` e `hub.verify_token`.
4. **Responder Challenge / Responder 403:** devolve o `hub.challenge` em texto puro (exigência da Meta) ou recusa o pedido.

### Ramo de mensagens (POST)
1. **Webhook WhatsApp (Mensagens Meta):** responde **200 OK imediatamente** para a Meta, evitando retentativas, e guarda o corpo bruto (opção *Raw Body*) para a validação da assinatura.
2. **Configuração (Envio):** guarda o App Secret da Meta, a URL do backend e o segredo compartilhado.
3. **Validar Assinatura e Filtrar:** confere o `X-Hub-Signature-256` e só deixa passar eventos com mensagens de clientes (`messages`) ou ecos do vendedor (`message_echoes`).
4. **Enviar para Sistema de Pedidos:** repassa o payload original da Meta como JSON (o texto chega intacto, com quebras de linha e aspas), com até 3 tentativas em caso de falha.
5. **Evento Ignorado:** fim do fluxo para eventos sem conteúdo ou com assinatura inválida.

---

## 3. Como Executar o n8n Localmente

O nó de validação de assinatura usa o módulo `crypto` do Node.js, que precisa ser liberado no n8n pela variável `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.

### Opção A: Execução via NPX (Sem Docker)
No PowerShell:
```powershell
$env:NODE_FUNCTION_ALLOW_BUILTIN = "crypto"
npx n8n
```
No Linux/macOS:
```bash
NODE_FUNCTION_ALLOW_BUILTIN=crypto npx n8n
```
O n8n iniciará na porta **5678**: `http://localhost:5678`

### Opção B: Execução via Docker
```bash
docker run -it --rm --name n8n -p 5678:5678 -e NODE_FUNCTION_ALLOW_BUILTIN=crypto -v ~/.n8n:/home/node/.n8n n8nio/n8n
```
No Docker, o backend não é `localhost` para o n8n: use `http://host.docker.internal:3000` no campo `backendUrl`.

---

## 4. Como Importar, Configurar e Ativar o Fluxo

1. Acesse o n8n no navegador em **`http://localhost:5678`**.
2. Em **Workflows**, use **Import from File** e selecione `n8n/workflows/whatsapp-pedidos-workflow.json` (na pasta do projeto).
3. Abra o nó **Configuração (Verificação)** e defina `verifyToken` (o mesmo valor que será informado no painel da Meta). O campo vem vazio de propósito: sem ele, a verificação é recusada.
4. Abra o nó **Configuração (Envio)** e defina:

   | Campo | Valor |
   |---|---|
   | `metaAppSecret` | App Secret do aplicativo na Meta. Vazio desativa a validação de assinatura (apenas para testes locais). |
   | `backendUrl` | Endereço do backend, ex.: `http://localhost:3000` |
   | `backendWebhookSecret` | O mesmo valor de `N8N_WEBHOOK_SECRET` no `backend/.env` |

5. Ative o interruptor **Active** no canto superior direito.

A URL de produção do webhook será `http://localhost:5678/webhook/whatsapp-webhook` (a mesma para GET e POST).

### Variáveis do backend (`backend/.env`)

| Variável | Uso |
|---|---|
| `N8N_WEBHOOK_SECRET` | Segredo exigido no cabeçalho `X-Webhook-Secret`. Obrigatório: vazio faz o endpoint rejeitar todas as chamadas. |
| `WHATSAPP_API_TOKEN` | Token da Cloud API. Necessário para baixar fotos, áudios e documentos; sem ele, o anexo é registrado só com a referência da mídia. |
| `WHATSAPP_GRAPH_API_VERSION` | Versão da Graph API usada no download (padrão `v21.0`). |

---

## 5. Configuração no Meta for Developers (Cloud API)

1. No painel do seu aplicativo Meta (WhatsApp Business Platform):
   - **Callback URL:** a URL pública do n8n (para testes locais, use ngrok/Cloudflare Tunnel: `https://seu-tunnel.ngrok-free.app/webhook/whatsapp-webhook`).
   - **Verify Token:** o mesmo valor de `verifyToken` do workflow.
2. Assine os campos de webhook:
   - `messages` (mensagens de clientes)
   - `smb_message_echoes` (mensagens enviadas no aplicativo pelo vendedor)

---

## 6. Testando a Integração

### Verificação (simula o cadastro da Callback URL na Meta)
```powershell
Invoke-RestMethod "http://localhost:5678/webhook/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=12345"
```
Resposta esperada: `12345`.

### Mensagem de cliente (simula a Meta enviando um evento ao n8n)
```powershell
$payload = @{
  object = "whatsapp_business_account"
  entry  = @(@{
    id = "WABA_TESTE"
    changes = @(@{
      field = "messages"
      value = @{
        messaging_product = "whatsapp"
        contacts = @(@{ wa_id = "5511988885555"; profile = @{ name = "Carlos Instalador" } })
        messages = @(@{
          id        = "wamid.teste_$(Get-Random)"
          from      = "5511988885555"
          timestamp = [string][int][double]::Parse((Get-Date -UFormat %s))
          type      = "text"
          text      = @{ body = "Bom dia!`n- 3 rolos de cabo 2.5 azul`n- 2 caixas 4x2" }
        })
      }
    })
  })
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:5678/webhook/whatsapp-webhook" -Method Post -Body $payload -ContentType "application/json"
```
Com `metaAppSecret` vazio, o n8n aceita o evento sem assinatura. Com ele preenchido, a chamada acima é descartada (como deve ser), e só eventos assinados pela Meta passam.

### Chamada direta ao backend (sem o n8n)
O endpoint `POST /api/webhooks/n8n/whatsapp` aceita o payload original da Meta (acima) ou o formato simplificado abaixo, sempre com o cabeçalho `X-Webhook-Secret`:
```powershell
$body = @{
  externalId  = "wam_n8n_test_$(Get-Random)"
  senderPhone = "+55 11 98888-5555"
  senderName  = "Carlos Instalador (via n8n)"
  messageType = "TEXT"
  text        = "Carlos, separa pra mim 3 rolos de cabo 2.5 azul e 2 caixas 4x2"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/n8n/whatsapp" -Method Post `
  -Headers @{ "X-Webhook-Secret" = $env:N8N_WEBHOOK_SECRET } `
  -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8"
```

O pedido aparece na tela de **Pedidos** (`http://localhost:3000/#orders`) com a etiqueta de WhatsApp. O botão **Simular WhatsApp ao Vivo** do painel e o `SIMULAR_WHATSAPP.bat` fazem o mesmo teste sem precisar do n8n.
