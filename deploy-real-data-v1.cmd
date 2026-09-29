@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo  Focus Ledger - Real Data V1 deploy

echo ==============================================
echo.

echo [1/4] Production build check...
call npm.cmd run build
if errorlevel 1 goto :build_failed

echo.
echo [2/4] Staging changes...
git add .
if errorlevel 1 goto :git_failed

echo.
echo [3/4] Creating commit...
git diff --cached --quiet
if not errorlevel 1 goto :nothing_to_commit
git commit -m "feat: connect tracker to real Supabase data"
if errorlevel 1 goto :git_failed

echo.
echo [4/4] Pushing to GitHub...
git push
if errorlevel 1 goto :git_failed

echo.
echo SUCCESS: GitHub updated. Vercel should deploy automatically.
goto :end

:nothing_to_commit
echo Nothing to commit. Running git push anyway...
git push
if errorlevel 1 goto :git_failed
goto :end

:build_failed
echo.
echo BUILD FAILED. Nothing was committed or pushed.
echo Copy the error output and send it to ChatGPT.
exit /b 1

:git_failed
echo.
echo Git operation failed. Nothing else will be changed automatically.
exit /b 1

:end
echo.
pause
endlocal
