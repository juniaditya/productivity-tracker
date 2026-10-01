@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Building production bundle...
call npm.cmd run build
if errorlevel 1 goto :fail

echo [2/3] Staging changes...
git add .

echo [3/3] Commit and push...
git commit -m "feat: add Google Calendar, milestones and backup"
if errorlevel 1 echo No new commit created; continuing to push existing commits.
git push
if errorlevel 1 goto :fail

echo.
echo Done. Vercel should deploy the new main commit automatically.
exit /b 0

:fail
echo.
echo Build or push failed. Nothing else was attempted after the failing step.
exit /b 1
