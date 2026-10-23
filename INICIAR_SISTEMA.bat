@echo off
chcp 65001 > nul
title Sistema de Pedidos - Materiais Elétricos
echo =====================================================================
echo ⚡ INICIANDO SISTEMA DE PROCESSAMENTO DE PEDIDOS DE MATERIAIS ELÉTRICOS ⚡
echo =====================================================================
echo.
echo Iniciando o servidor backend e abrindo a aplicacao no seu navegador...
echo.

cd /d "%~dp0"
start "" http://localhost:3000
cmd.exe /c "node backend/src/server.js"
pause
