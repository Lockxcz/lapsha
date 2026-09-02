@echo off
chcp 65001 >nul
setlocal

where py >nul 2>nul
if %errorlevel%==0 (
  py "%~dp0apply-update.py"
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  python "%~dp0apply-update.py"
  goto :end
)

echo.
echo [ОШИБКА] Python не найден.
echo Установите Python 3 или запустите apply-update.py через установленный Python.
pause

:end
endlocal
