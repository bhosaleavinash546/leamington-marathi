@echo off
setlocal enabledelayedexpansion
rem ===========================================================================
rem  CostVision - Windows launcher
rem
rem  Double-click this file. It needs no administrator rights, no installer and
rem  no network: everything it runs is inside this folder.
rem
rem  Expected layout (what scripts/package-windows.mjs produces):
rem
rem      CostVision\
rem        Start-CostVision.bat      <- this file
rem        runtime\node\node.exe     portable Node
rem        runtime\python\python.exe embedded Python with OCP already installed
rem        app\                      the application, node_modules and dist built
rem
rem  Run from a checkout instead and it falls back to whatever node and python
rem  are on PATH, which is how you test the script without building a package.
rem ===========================================================================

cd /d "%~dp0"
title CostVision

echo.
echo   +---------------------------------------------+
echo   ^|   CostVision . Should-Cost                  ^|
echo   +---------------------------------------------+
echo.

rem --- Where the app lives: packaged (app\) or a checkout (calculator\) -------
if exist "%~dp0app\server\index.ts" (
  set "APP_DIR=%~dp0app"
) else if exist "%~dp0calculator\server\index.ts" (
  set "APP_DIR=%~dp0calculator"
) else (
  echo   [X] Cannot find the application folder.
  echo       Expected app\ next to this file, or calculator\ in a checkout.
  goto :die
)

rem --- Node: bundled first, then PATH ----------------------------------------
if exist "%~dp0runtime\node\node.exe" (
  set "NODE_EXE=%~dp0runtime\node\node.exe"
  set "NPX_CMD=%~dp0runtime\node\npx.cmd"
) else (
  where node >nul 2>&1 || (
    echo   [X] Node is not bundled and not on PATH.
    echo       A packaged copy carries its own: re-run the packaging script,
    echo       or install Node 22 to test from a checkout.
    goto :die
  )
  set "NODE_EXE=node"
  set "NPX_CMD=npx"
)

rem --- Python: the STEP/IGES kernel ------------------------------------------
rem  PYTHON_BIN is what geometry-bridge.ts spawns. Point it at the bundled
rem  interpreter, which is the one with OCP installed. On Windows there is no
rem  "python3" command, so the default would fail even with Python installed.
if exist "%~dp0runtime\python\python.exe" (
  set "PYTHON_BIN=%~dp0runtime\python\python.exe"
) else (
  where python >nul 2>&1 && set "PYTHON_BIN=python"
)
if not defined PYTHON_BIN (
  echo   [!] No Python found. STL files still cost normally; STEP and IGES
  echo       need the geometry kernel and will report an error until it is there.
  echo.
) else (
  "!PYTHON_BIN!" -c "import OCP" >nul 2>&1
  if errorlevel 1 (
    echo   [!] Python found but OCP is missing, so STEP and IGES cannot be
    echo       measured. Install it with:
    echo         "!PYTHON_BIN!" -m pip install -r "%~dp0requirements.txt"
    echo.
  )
)

rem --- Data outside the install folder ---------------------------------------
rem  A standard user cannot write under C:\Program Files, and the database is
rem  opened on the first request. Keeping it in the profile also means the
rem  rate book and saved costings survive a reinstall.
if not defined CV_DATA_DIR set "CV_DATA_DIR=%LOCALAPPDATA%\CostVision"
if not exist "%CV_DATA_DIR%" mkdir "%CV_DATA_DIR%" 2>nul
if not exist "%CV_DATA_DIR%" (
  echo   [X] Cannot create the data folder: %CV_DATA_DIR%
  goto :die
)

rem --- Settings, written once, kept in the profile ---------------------------
set "ENV_FILE=%CV_DATA_DIR%\settings.env"
if not exist "%ENV_FILE%" (
  rem A signing secret this machine keeps. Generated, never shipped: a secret
  rem baked into a package everyone installs is not a secret.
  for /f "delims=" %%S in ('"!NODE_EXE!" -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set "GEN=%%S"
  > "%ENV_FILE%" echo JWT_SECRET=!GEN!
  rem No AI in this deployment. AIR_GAPPED=1 makes every model call throw
  rem rather than merely being unconfigured, so it cannot start reaching out
  rem because someone pasted a key in. Delete this line to allow AI later --
  rem the code is all still there.
  >> "%ENV_FILE%" echo AIR_GAPPED=1
  >> "%ENV_FILE%" echo PORT=3002
  echo   [ok] First run - settings written to %ENV_FILE%
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  if not "%%A"=="" if not "%%A:~0,1"=="#" set "%%A=%%B"
)
if not defined PORT set "PORT=3002"
set "NODE_ENV=production"
set "URL=http://localhost:%PORT%/calculator/"

rem --- Already running? Just open it -----------------------------------------
"!NODE_EXE!" -e "fetch('http://localhost:%PORT%/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 (
  echo   [ok] CostVision is already running.
  start "" "%URL%"
  goto :done
)

echo   Starting CostVision...
echo     data:   %CV_DATA_DIR%
if defined PYTHON_BIN echo     kernel: !PYTHON_BIN!
echo.

cd /d "%APP_DIR%"
rem  Started detached so closing this window does not stop the app. dist is
rem  resolved from the working directory, which is why we cd first.
start "CostVision server" /min "!NPX_CMD!" tsx server/index.ts

rem --- Wait for it to answer, then open the browser ---------------------------
set /a TRIES=0
:wait
set /a TRIES+=1
"!NODE_EXE!" -e "fetch('http://localhost:%PORT%/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 goto :up
if %TRIES% GEQ 40 goto :slow
rem  A short sleep without needing timeout.exe, which is unavailable when the
rem  window has no console input handle.
"!NODE_EXE!" -e "setTimeout(()=>{},1500)" >nul 2>&1
goto :wait

:up
echo   [ok] CostVision is running.
echo   Opening %URL%
start "" "%URL%"
goto :done

:slow
echo   [!] It is taking longer than expected. Opening the browser anyway --
echo       if the page is blank, wait a few seconds and refresh.
start "" "%URL%"
goto :done

:done
echo.
echo   -----------------------------------------------
echo   CostVision keeps running in the background.
echo   You can close this window.
echo   To stop it: close the "CostVision server" window.
echo   -----------------------------------------------
echo.
pause
exit /b 0

:die
echo.
pause
exit /b 1
