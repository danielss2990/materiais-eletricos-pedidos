@echo off
chcp 65001 > nul
title Simulação WhatsApp ao Vivo
echo =====================================================================
echo 📲 SIMULANDO CHEGADA DE MENSAGEM NO WHATSAPP BUSINESS VIA N8N
echo =====================================================================
echo.
echo Enviando mensagem de cliente de teste...

powershell -Command "$ext = 'wam_demo_' + [Guid]::NewGuid().ToString().Substring(0,8); $p = @{ externalId=$ext; senderPhone='+55 11 98888-1234'; senderName='Eng. Roberto (Obra Jardins)'; messageType='TEXT'; text='Carlos, bom dia! Separa pra mim urgente: 2 rolos de fio de duas e meia azul, 5 disjuntor de 20 monopolar e 1 passa-fio'; timestamp=[string][int][double]::Parse((Get-Date -UFormat %%s)) } | ConvertTo-Json; try { $h = @{}; $m = Select-String -Path '%~dp0backend\.env' -Pattern '^N8N_WEBHOOK_SECRET=(.+)$' -ErrorAction SilentlyContinue; if ($m) { $h['X-Webhook-Secret'] = $m.Matches[0].Groups[1].Value.Trim() }; $res = Invoke-RestMethod -Uri 'http://localhost:3000/api/webhooks/n8n/whatsapp' -Method Post -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($p)) -ContentType 'application/json; charset=utf-8'; Write-Host 'SUCESSO: Pedido criado com codigo ' $res.order_code -ForegroundColor Green; Write-Host 'Verifique a aba Pedidos no navegador: http://localhost:3000/#orders' -ForegroundColor Cyan } catch { Write-Host 'ERRO: Certifique-se de que o servidor esta rodando.' -ForegroundColor Red }"

echo.
pause
