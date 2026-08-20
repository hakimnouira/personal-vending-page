# OmniRoute + Claude Code PowerShell Launcher
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  OmniRoute + Claude Code Launcher" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

$env:ANTHROPIC_BASE_URL = "http://localhost:20128"
$env:ANTHROPIC_AUTH_TOKEN = "omniroute"
$env:OPENAI_BASE_URL = "http://localhost:20128/v1"

Write-Host "Target Base URL: $env:ANTHROPIC_BASE_URL" -ForegroundColor Green
Write-Host "Launching Claude Code connected to OmniRoute..." -ForegroundColor Yellow
Write-Host ""

npx omniroute launch $args
