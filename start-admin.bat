@echo off
setlocal enabledelayedexpansion
title Oriflame Assistant - Local Admin Launcher
cd /d "%~dp0"

echo ================================================================
echo          ORIFLAME SHOPPING ASSISTANT - ADMIN LAUNCHER
echo ================================================================
echo.

:: -----------------------------------------------------------------
:: STEP 1: Git Synchronization (safe fallback if git not present)
:: -----------------------------------------------------------------
echo [1/3] Synchronizing repository (git pull)...
where git >nul 2>nul
if %errorlevel% equ 0 (
    git pull
    if !errorlevel! neq 0 (
        echo [!] Notice: Git pull encountered an issue. Proceeding with local version.
    ) else (
        echo [OK] Codebase is up to date.
    )
) else (
    echo [INFO] Git not detected on this PC. Running local files directly.
)
echo.

:: -----------------------------------------------------------------
:: STEP 2: Node.js Runtime Check & Automatic Portable Setup
:: -----------------------------------------------------------------
echo [2/3] Checking Node.js runtime...

set "LOCAL_NODE_DIR=%~dp0.node_runtime\node-v20.18.0-win-x64"

if exist "%LOCAL_NODE_DIR%\node.exe" goto :use_portable_node

where node >nul 2>nul
if %errorlevel% equ 0 goto :check_dependencies

echo [!] Node.js is not installed on this PC.
echo [*] Downloading portable standalone Node.js (one-time setup, ~35MB)...
echo.

if not exist "%~dp0.node_runtime" mkdir "%~dp0.node_runtime"

where curl >nul 2>nul
if %errorlevel% equ 0 (
    curl -L -o "%~dp0.node_runtime\node.zip" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
) else (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' -OutFile '%~dp0.node_runtime\node.zip'"
)

if not exist "%~dp0.node_runtime\node.zip" (
    echo [ERROR] Failed to download portable Node.js.
    pause
    exit /b 1
)

echo [*] Extracting portable runtime...
where tar >nul 2>nul
if %errorlevel% equ 0 (
    tar -xf "%~dp0.node_runtime\node.zip" -C "%~dp0.node_runtime"
) else (
    powershell -NoProfile -Command "Expand-Archive -Path '%~dp0.node_runtime\node.zip' -DestinationPath '%~dp0.node_runtime' -Force"
)

if exist "%~dp0.node_runtime\node.zip" del /f /q "%~dp0.node_runtime\node.zip"

if not exist "%LOCAL_NODE_DIR%\node.exe" (
    echo [ERROR] Could not setup portable Node.js.
    pause
    exit /b 1
)

:use_portable_node
set "PATH=%LOCAL_NODE_DIR%;%PATH%"
echo [OK] Portable Node.js runtime active.

:check_dependencies
if not exist "node_modules\" (
    echo [INFO] First-time setup: installing dependencies...
    call npm install --no-audit --no-fund
    if !errorlevel! neq 0 (
        echo [ERROR] npm install encountered an error.
        pause
        exit /b 1
    )
)

echo [OK] Node.js environment is ready.
echo.

:: -----------------------------------------------------------------
:: STEP 3: Database Selection & Migration Menu
:: -----------------------------------------------------------------
:menu
echo ================================================================
echo           SELECTION DE L'ENVIRONNEMENT BASE DE DONNEES
echo ================================================================
echo.
echo   [1] Mode TEST / DEVELOPPEMENT (neondb_dev)
echo       --^> Recommande pour tester, modifier des prix ou scraper sans
echo          impacter le site en direct ni les clients.
echo.
echo   [2] Mode PRODUCTION DIRECTE (neondb)
echo       --^> Connecte en temps reel a la boutique en ligne deployee.
echo          Toutes vos modifications seront immediatement visibles en ligne.
echo.
echo   [3] 🚀 MIGRATION : Promouvoir TEST vers PRODUCTION (DEV -^> PROD)
echo       --^> Rend vos tests, ajouts de produits, packs, deals et carrousel
echo          officiels sur le site principal.
echo          (Les commandes clients en production restent 100%% protegees)
echo.
echo   [4] 🔄 REFRESH : Cloner PRODUCTION vers TEST (PROD -^> DEV)
echo       --^> Met a jour la base de test avec les dernieres donnees du site direct.
echo.
echo   [5] Quitter
echo ================================================================
set "DB_CHOICE="
set /p DB_CHOICE="Votre choix [1, 2, 3, 4 ou 5] (defaut = 1): "

if "%DB_CHOICE%"=="" set "DB_CHOICE=1"
if "%DB_CHOICE%"=="1" goto :launch_dev
if "%DB_CHOICE%"=="2" goto :launch_prod
if "%DB_CHOICE%"=="3" goto :migrate_dev_to_prod
if "%DB_CHOICE%"=="4" goto :migrate_prod_to_dev
if "%DB_CHOICE%"=="5" exit /b 0

echo [!] Choix invalide. Veuillez reessayer.
goto :menu

:migrate_dev_to_prod
echo.
echo ================================================================
echo  ATTENTION : MIGRATION DES DONNEES TEST VERS PRODUCTION
echo ================================================================
echo  Vous allez publier vos produits, packs, deals et carrousel
echo  depuis TEST (neondb_dev) vers le site direct (neondb).
echo.
echo  * Les commandes clients en Production ne seront PAS touchees.
echo ================================================================
set "CONFIRM_MIGRATE="
set /p CONFIRM_MIGRATE="Confirmer la publication en PRODUCTION ? (o/n) : "
if /i not "%CONFIRM_MIGRATE%"=="o" (
    echo [INFO] Migration annulee.
    echo.
    goto :menu
)
echo.
echo [*] Execution de la synchronisation DEV -> PROD...
node scripts/sync-database.js dev-to-prod
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] La synchronisation a echoue.
    pause
    goto :menu
)
echo.
echo [SUCCES] Vos modifications sont maintenant officielles en PRODUCTION !
echo.
pause
goto :menu

:migrate_prod_to_dev
echo.
echo [*] Copie des donnees fraiches de PRODUCTION (neondb) vers TEST (neondb_dev)...
node scripts/sync-database.js prod-to-dev
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] La synchronisation a echoue.
    pause
    goto :menu
)
echo.
echo [SUCCES] Base de test rafraichie avec succes !
echo.
pause
goto :menu

:launch_dev
set "DATABASE_URL=postgresql://neondb_owner:npg_mT2tafI7Hlzh@ep-spring-salad-axpj634w-pooler.c-4.us-east-2.aws.neon.tech/neondb_dev?sslmode=require"
echo.
echo ================================================================
echo   ENVIRONNEMENT : [TEST / DEVELOPPEMENT - neondb_dev]
echo   (Vos modifications n'impacteront pas les clients en direct)
echo ================================================================
goto :start_server

:launch_prod
echo.
echo ================================================================
echo   ATTENTION : [BASE DE PRODUCTION EN DIRECT - neondb]
echo   (Toute action modifiera la boutique publique reelle !)
echo ================================================================
set "DATABASE_URL=postgresql://neondb_owner:npg_mT2tafI7Hlzh@ep-spring-salad-axpj634w-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require"
goto :start_server

:start_server
echo.
echo ================================================================
echo   Boutique Client :   http://localhost:3000
echo   Admin Portal :      http://localhost:3000/admin
echo ================================================================
echo.
echo Ouverture automatique du portail Admin dans votre navigateur...
echo (Gardez cette fenetre de terminal ouverte pendant votre session)
echo.

:: Open browser after 2 seconds asynchronously
start "" /b cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:3000/admin"

:: Start the server process
node server.js

if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Le serveur s'est arrete avec le code !errorlevel!.
    pause
)
