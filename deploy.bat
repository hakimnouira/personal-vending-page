@echo off
setlocal enabledelayedexpansion
title Deploiement en Ligne - Mouna Nouira Wasmer
cd /d "C:\Users\chokri\Desktop\oriflame site\personal-vending-page"

set "LOCAL_NODE_DIR=C:\Users\chokri\Desktop\oriflame site\personal-vending-page\.node_runtime\node-v20.18.0-win-x64"
if exist "%LOCAL_NODE_DIR%\node.exe" set "PATH=%LOCAL_NODE_DIR%;%PATH%"

echo ========================================================
echo   DEPLOIEMENT EN LIGNE - MOUNA NOUIRA (WASMER APP)
echo ========================================================
echo.
echo Repertoire du projet : C:\Users\chokri\Desktop\oriflame site\personal-vending-page
echo.
echo [1/2] Synchronisation de la base de donnees de Production...
node scripts/sync-database.js dev-to-prod
echo.
echo [2/2] Envoi du code vers GitHub (declenche le deploiement Wasmer)...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo --------------------------------------------------------
    echo [!] Authentification GitHub requise pour le push.
    echo --------------------------------------------------------
    echo Si vous avez un GitHub Personal Access Token (PAT),
    echo collez-le ci-dessous et appuyez sur Entree.
    echo.
    set /p "GHTOKEN=GitHub Token (ghp_...) : "
    if defined GHTOKEN (
        echo Envoi avec le token...
        git push https://!GHTOKEN!@github.com/hakimnouira/personal-vending-page.git main
    )
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   [SUCCES] Code publie sur GitHub et deploie sur Wasmer !
    echo   Site en direct : https://mouna-nouira.wasmer.app/
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   [ERREUR] Le push n'a pas pu etre effectue.
    echo ========================================================
)
echo.
pause
