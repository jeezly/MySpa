@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
 echo Primero instala dependencias: npm install
 pause
 exit /b 1
)
if not exist .env (
 echo Configurando MySpa por primera vez...
 call npm run setup
 if errorlevel 1 (pause & exit /b 1)
)
call npm run dev
pause
