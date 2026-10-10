@echo off
rem ---------------------------------------------------------------
rem  Dev helper for this project. Node is not installed system-wide,
rem  so the runtime bundled with DSH is wired in from a known path.
rem  Works both inside DSH shells and from a plain terminal / double click.
rem
rem  Usage:
rem    dev.cmd install    install dependencies
rem    dev.cmd dev        start dev server  http://localhost:4321
rem    dev.cmd build      build static site into dist\
rem    dev.cmd preview    preview the build
rem ---------------------------------------------------------------
setlocal
set "PROJ=%~dp0"
set "CACHE=%~dp0..\.dsh-cache"
set "REL=dsh-runtimes\dsh-primary-runtime\dependencies"

rem 1) DSH sets DSH_HOME inside its own shells.
rem 2) Otherwise use the default user-level DSH home.
set "DEP="
if defined DSH_HOME if exist "%DSH_HOME%\%REL%\node\bin\node.exe" set "DEP=%DSH_HOME%\%REL%"
if not defined DEP if exist "%USERPROFILE%\.dsh\%REL%\node\bin\node.exe" set "DEP=%USERPROFILE%\.dsh\%REL%"

if not defined DEP (
  echo [dev.cmd] Bundled Node runtime not found, falling back to pnpm on PATH.
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
