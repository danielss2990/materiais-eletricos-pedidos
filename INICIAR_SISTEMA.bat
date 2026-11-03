@echo off
chcp 65001 > nul
title Sistema de Pedidos - Materiais Elétricos
echo =====================================================================
echo ⚡ INICIANDO SISTEMA DE PROCESSAMENTO DE PEDIDOS DE MATERIAIS ELÉTRICOS ⚡
echo =====================================================================
echo.

cd /d "%~dp0backend"

where node > nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale o Node.js v22.13 ou superior.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo Criando arquivo .env a partir do .env.example...
  copy ".env.example" ".env" > nul
)

if not exist "data\database.sqlite" (
  echo Populando o banco de dados com dados de demonstracao...
  call node src/database/seed.js
)

echo.
echo Iniciando o servidor backend e abrindo a aplicacao no seu navegador...
echo.
start "" http://localhost:3000
cmd.exe /c "node src/server.js"
pause
