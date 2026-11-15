# AI-assisted (Claude): one command to ship TwinWorlds.
# Usage (from the Fullbuild folder):   .\deploy "what changed"
# Steps: backend (Worker) -> website build -> website upload (Pages) -> git commit, pull, push.
# Stops at the first step that fails, so nothing half-ships.
param([string]$Message = "Update TwinWorlds")

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Step($name, [scriptblock]$cmd) {
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
    & $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED at: $name (nothing after this step ran)" -ForegroundColor Red
        exit 1
    }
}

Step "1/5 Backend (Cloudflare Worker)" { Set-Location "$root\worker"; npm run deploy }
Step "2/5 Build website"              { Set-Location "$root\frontend"; npm run build }
Step "3/5 Upload website (Pages)"     { Set-Location "$root\frontend"; npx wrangler pages deploy dist --project-name twinworlds --branch main --commit-dirty=true }
Set-Location $root
Step "4/5 Save to git"                { git add -A; git commit -m $Message; if ($LASTEXITCODE -eq 1) { $global:LASTEXITCODE = 0 } }
Step "5/5 Sync with GitHub"           { git pull --no-edit; if ($LASTEXITCODE -eq 0) { git push } }

Write-Host ""
Write-Host "All done. Live at https://twinworlds.pages.dev" -ForegroundColor Green
