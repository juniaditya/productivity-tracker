param(
  [string]$RepoUrl = "https://github.com/juniaditya/productivity-tracker.git"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

$origin = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
  git remote add origin $RepoUrl
} elseif ($origin -ne $RepoUrl) {
  git remote set-url origin $RepoUrl
}

git add .
$status = git status --porcelain
if ($status) {
  git commit -m "feat: initial productivity tracker"
}

git push -u origin main
