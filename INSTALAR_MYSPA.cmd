@echo off
setlocal
cd /d "%~dp0"
echo ======================================
echo      INSTALADOR LOCAL DE MYSPA
 echo ======================================
where node >nul 2>nul
if errorlevel 1 (
 echo ERROR: Instala Node.js LTS v22 o superior primero.
 pause
 exit /b 1
)
call npm install
if errorlevel 1 (echo ERROR de npm install & pause & exit /b 1)
call npm run setup
if errorlevel 1 (echo Revisa MySQL y el archivo .env & pause & exit /b 1)
echo.
echo LISTO. Abre INICIAR_MYSPA.cmd
pause
