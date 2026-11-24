@echo off
setlocal
cd /d "%~dp0"
if not exist "tools\jinil_launch.py" (
  echo [ERROR] Required launcher file is missing.
  echo Please extract the entire GitHub ZIP first.
  pause
  exit /b 1
)
where py >nul 2>&1
if not errorlevel 1 (
  py -3 "tools\jinil_launch.py"
  goto :done
)
where python >nul 2>&1
if not errorlevel 1 (
  python "tools\jinil_launch.py"
  goto :done
)
echo.
echo [ERROR] Python 3 is not installed or not available.
echo Install Python 3 on this development PC first.
pause
exit /b 1
:done
if errorlevel 1 pause
endlocal
