@echo off
setlocal
cd /d "%~dp0"
echo ===============================================
echo MYSPA - Ampliacion de catalogo bibliotecario
echo ===============================================
call npm run catalogo:revisar
if errorlevel 1 goto error
call npm run catalogo
if errorlevel 1 goto error
echo.
echo Catalogo actualizado. Abre npm run dev para visualizarlo.
pause
exit /b 0
:error
echo.
echo Ocurrio un error. Revisa lo indicado arriba.
pause
exit /b 1
