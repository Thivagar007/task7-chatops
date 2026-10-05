<#
.SYNOPSIS
  Package the bot (production dependencies only) and zip-deploy it to the
  Function App (production or the staging slot). Used for manual deploys;
  the Azure DevOps pipeline does the same in CI.
.EXAMPLE
  ./scripts/deploy-bot.ps1                  # production
  ./scripts/deploy-bot.ps1 -Slot staging    # staging slot
#>
param(
  [string] $ResourceGroup = "rg-task7-chatops",
  [string] $AppName       = "func-chatops-rzjw",
  [string] $Slot          = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$bot  = Join-Path $root "app\bot"
$zip  = Join-Path $root "bot.zip"

Push-Location $bot
try {
  Write-Host "== Installing production dependencies" -ForegroundColor Cyan
  npm ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

  Write-Host "== Creating $zip" -ForegroundColor Cyan
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path host.json, package.json, src, node_modules -DestinationPath $zip -CompressionLevel Fastest

  Write-Host "== Deploying to $AppName $(if ($Slot) { "(slot $Slot)" } else { '(production)' })" -ForegroundColor Cyan
  $slotArgs = if ($Slot) { @("--slot", $Slot) } else { @() }
  az functionapp deployment source config-zip -g $ResourceGroup -n $AppName --src $zip @slotArgs -o none
  if ($LASTEXITCODE -ne 0) { throw "deployment failed" }
  Write-Host "== Deployed" -ForegroundColor Green
}
finally {
  npm install --no-audit --no-fund | Out-Null   # restore dev dependencies for tests
  Pop-Location
}
