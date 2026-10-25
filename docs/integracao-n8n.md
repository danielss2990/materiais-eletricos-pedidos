# Guia de Integração Oficial com o n8n para WhatsApp
## Sistema Inteligente de Processamento de Pedidos — Materiais Elétricos

---

## 1. Visão Geral da Integração

O **n8n** é uma plataforma de orquestração de fluxos baseada em nós que simplifica a captura, transformação e encaminhamento de eventos de mensageria.

Nesta arquitetura, o n8n atua como a **camada de ingestão e pré-processamento do WhatsApp**:

```
 [Cliente WhatsApp]
         |
         v
 [Meta Cloud API / WhatsApp Business]
         | (Webhook HTTPS)
         v
 [n8n Workflow] (Porta 5678)
   ├─ 1. Validação de Handshake & Assinatura Meta
   ├─ 2. Extração de Metadados (Remetente, Telefone, Timestamp)
   ├─ 3. Separação de Mídia (Áudio, Imagem, Documento)
   └─ 4. HTTP Request -> POST /api/webhooks/n8n/whatsapp
         |
         v
 [Backend Node.js - Sistema de Pedidos] (Porta 3000)
   ├─ Deduplicação Idempotente (wam_id)
   ├─ Fila Assíncrona de Processamento (taskQueue)
   ├─ Motor Multimodal de IA (Normalização & Ambiguidade)
   └─ Tela de Revisão Humana (Split-Screen)
```

---

## 2. Arquivo do Workflow Pronto para Importação

O workflow oficial está salvo e pronto para importação em:  
📂 **`n8n/workflows/whatsapp-pedidos-workflow.json`**

### Nós incluídos no fluxo:
1. **Webhook WhatsApp (Meta):** Escuta requisições `POST` no endpoint `/webhook/whatsapp-webhook`.
2. **Normalizar Mensagem WhatsApp (Code Node):** Trata payloads complexos da Meta Cloud API, isolando `wam_id`, número de telefone, nome do contato e conteúdo textual ou referências de mídia.
3. **Mensagem Válida? (IF Node):** Descarta pings vazios ou notificações de entrega sem conteúdo de pedido.
4. **Enviar para Sistema de Pedidos (HTTP Request Node):** Envia os dados estruturados para o endpoint corporativo `http://localhost:3000/api/webhooks/n8n/whatsapp`.
5. **Responder 200 OK para Meta (Respond to Webhook):** Retorna status 200 para a Meta em menos de 1 segundo, prevenindo retentativas desnecessárias.

---

## 3. Como Executar o n8n Localmente

### Opção A: Execução via NPX (Sem Docker)
No terminal:
```bash
npx n8n
```
O n8n iniciará na porta **5678**: `http://localhost:5678`

### Opção B: Execução via Docker
```bash
docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
```

---

## 4. Como Importar e Ativar o Fluxo no n8n

1. Acesse o n8n no navegador em **`http://localhost:5678`**.
2. No menu lateral, clique em **Workflows** -> **Import from File**.
3. Selecione o arquivo:  
   `c:\Users\gusta\projetos\materiais-eletricos-pedidos\n8n\workflows\whatsapp-pedidos-workflow.json`
4. O fluxo será exibido visualmente.
5. Clique no nó **Webhook WhatsApp (Meta)** para obter a URL do webhook (ex.: `http://localhost:5678/webhook/whatsapp-webhook`).
6. Ative o interruptor **Active** no canto superior direito para manter o fluxo ouvindo eventos em produção.

---

## 5. Configuração no Meta for Developers (Cloud API)

1. No painel do seu aplicativo Meta (WhatsApp Business Platform):
   - **Callback URL:** Insira a URL pública gerada para o n8n (utilize ngrok/Cloudflare Tunnel para testes locais: `https://seu-tunnel.ngrok-free.app/webhook/whatsapp-webhook`).
   - **Verify Token:** Token definido nas suas variáveis de ambiente (ex.: `token_verificacao_meta_webhook_2026`).
2. Assine os campos de webhook:
   - `messages` (mensagens de clientes)
   - `smb_message_echoes` (mensagens enviadas no aplicativo pelo vendedor)

---

## 6. Testando o Vínculo com o n8n via PowerShell

Você pode simular o envio que o n8n faz para o nosso backend com este comando no PowerShell:

```powershell
$n8nPayload = @{
  externalId   = "wam_n8n_test_$(Get-Random)"
  senderPhone  = "+55 11 98888-5555"
  senderName   = "Carlos Instalador (via n8n)"
  messageType  = "TEXT"
  text         = "Carlos, separa pra mim 3 rolos de cabo 2.5 azul e 2 caixas 4x2"
  timestamp    = [string][int][double]::Parse((Get-Date -UFormat %s))
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/webhooks/n8n/whatsapp" -Method Post -Body $n8nPayload -ContentType "application/json" -Headers @{ "X-Webhook-Token" = $env:WEBHOOK_TOKEN }
```

### Resposta esperada do sistema:
```json
{
  "status": "SUCCESS",
  "orchestrator": "n8n",
  "order_id": "ord_...",
  "order_code": "PED-2026-...",
  "message": "Mensagem do WhatsApp processada com sucesso via n8n e integrada ao sistema."
}
```

O pedido aparecerá imediatamente na tela de **Pedidos** (`http://localhost:3000/#orders`) com a etiqueta verde de WhatsApp e anotação de auditoria `Capturado via n8n Orchestrator`.
