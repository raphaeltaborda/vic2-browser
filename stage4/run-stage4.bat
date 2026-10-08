@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 serve-local.py
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python serve-local.py
  goto :eof
)
echo Python 3 nao foi encontrado. Instale o Python 3 ou sirva esta pasta com COOP/COEP.
pause
