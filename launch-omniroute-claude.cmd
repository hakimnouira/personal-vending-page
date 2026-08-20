@echo off
echo ===================================================
echo   OmniRoute + Claude Code Launcher
echo ===================================================
echo.

set ANTHROPIC_BASE_URL=http://localhost:20128
set ANTHROPIC_AUTH_TOKEN=omniroute
set OPENAI_BASE_URL=http://localhost:20128/v1

echo Target Base URL : %ANTHROPIC_BASE_URL%
echo.
echo Launching Claude Code connected to OmniRoute...
echo.

npx omniroute launch %*
