@echo off
rem ---------------------------------------------------------------
rem  Run this project inside the DSH sandbox (node is not on PATH,
rem  so the bundled runtime is wired in explicitly).
rem
rem  Usage:
rem    dev.cmd install    install dependencies
rem    dev.cmd dev        start dev server  http://localhost:4321
rem    dev.cmd build      build static site into dist\
rem    dev.cmd preview    preview the build
rem ---------------------------------------------------------------
setlocal
set "PROJ=%~dp0"
set "DEP=%DSH_HOME%\dsh-runtimes\dsh-primary-runtime\dependencies"
set "CACHE=%~dp0..\.dsh-cache"

if not exist "%DEP%\node\bin\node.exe" (
  echo [dev.cmd] DSH bundled Node runtime not found, falling back to pnpm on PATH.
  cd /d "%PROJ%"
  pnpm %*
  exit /b %ERRORLEVEL%
)

set "PATH=%DEP%\node\bin;%PATH%"
rem Keep pnpm cache, state and store inside the workspace: paths
rem outside of it are not writable under the sandbox.
set "XDG_CACHE_HOME=%CACHE%"
set "XDG_STATE_HOME=%CACHE%"
set "PNPM_HOME=%CACHE%\pnpm-home"
rem Astro telemetry writes to %APPDATA%\astro, which is not writable here.
set "ASTRO_TELEMETRY_DISABLED=1"

cd /d "%PROJ%"
"%DEP%\node\bin\node.exe" "%DEP%\pnpm\bin\pnpm.mjs" %*
exit /b %ERRORLEVEL%
