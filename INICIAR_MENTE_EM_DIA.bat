@echo off
cd /d "%~dp0"
title Mente em Dia - FMU Tech
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22.13 ou superior em https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo Acesse o Mente em Dia em: http://localhost:3000
echo Mantenha esta janela aberta durante o uso.
echo.
node server.js
pause
