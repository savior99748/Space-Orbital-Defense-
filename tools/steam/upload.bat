@echo off
rem Uploads Ringwarden to Steam. Put this file in the SDK's tools\ContentBuilder folder (see tools/steam/README.md).
rem You'll be asked for your password, and the first time for a Steam Guard code.
set /p STEAMUSER=Steam partner account name: 
builder\steamcmd.exe +login %STEAMUSER% +run_app_build ..\scripts\ringwarden_app_build.vdf +quit
pause
