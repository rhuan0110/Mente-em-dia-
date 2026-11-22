@echo off
title Mente em Dia - FMU Tech
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js para iniciar o servidor.
  pause
  exit /b 1
)
node server.js
pause
