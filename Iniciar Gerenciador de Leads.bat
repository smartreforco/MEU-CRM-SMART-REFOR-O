@echo off
title Gerenciador de Leads - Smart Reforço
color 0A

echo.
echo ========================================
echo    GERENCIADOR DE LEADS - SMART REFORÇO
echo ========================================
echo.
echo Iniciando o sistema...
echo.

cd /d "%~dp0"

REM Verifica se o ambiente virtual existe
if exist ".venv\Scripts\python.exe" (
    echo [OK] Ambiente Python encontrado
    set PYTHON=.venv\Scripts\python.exe
) else if exist "..\.venv\Scripts\python.exe" (
    echo [OK] Ambiente Python encontrado
    set PYTHON=..\.venv\Scripts\python.exe
) else (
    echo [ERRO] Ambiente Python nao encontrado!
    echo Certifique-se de que o .venv existe.
    pause
    exit /b 1
)

echo [OK] Iniciando servidor...
echo.
echo ========================================
echo    Sistema rodando em: http://localhost:5000
echo    Pressione Ctrl+C para encerrar
echo ========================================
echo.

REM Abre o navegador automaticamente após 2 segundos
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"

REM Inicia o servidor Flask
cd gerenciador_leads
"%~dp0.venv\Scripts\python.exe" app.py

pause
