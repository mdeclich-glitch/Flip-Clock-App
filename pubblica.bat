@echo off
cd /d "%~dp0"
echo.
echo  Pubblica un aggiornamento di Flip Clock
echo  ---------------------------------------
set "MSG="
set /p MSG=Descrizione (facoltativa, premi Invio per saltare): 
echo.
if defined MSG (
  call npm run release -- patch "%MSG%"
) else (
  call npm run release
)
echo.
pause