<#
.SYNOPSIS
  Deploy a version of the demo service orders-svc to a slot and record it in
  the App Service deployment history (version, status, deployer) - the data
  the bot's get_deployment_history tool returns.
.EXAMPLE
  ./scripts/deploy-target.ps1 -Version 1.0.0 -Slot production
  ./scripts/deploy-target.ps1 -Version 1.1.0 -Slot staging -Swap
  ./scripts/deploy-target.ps1 -Version 1.2.0 -Slot staging -Broken -Swap
#>
param(
  [Parameter(Mandatory)] [string] $Version,
  [ValidateSet("production", "staging")] [string] $Slot = "staging",
  [switch] $Broken,            # simulate a bad release (/api/orders returns 500)
  [switch] $Swap,              # swap staging -> production after deploying
  [string] $ResourceGroup = "rg-task7-target",
  [string] $AppName       = "func-orders-svc-rzjw"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $root "app\orders-svc"
$work = Join-Path $env:TEMP "orders-svc-build"
$zip  = Join-Path $env:TEMP "orders-svc-$Version.zip"

# 1. Build the package with release.json baked in (version moves with the code)
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
Copy-Item $src $work -Recurse
@{ version = $Version; broken = [bool]$Broken; builtAt = (Get-Date).ToUniversalTime().ToString("o") } |
  ConvertTo-Json | Set-Content (Join-Path $work "src\release.json") -Encoding utf8
Push-Location $work
npm install --omit=dev --no-audit --no-fund | Out-Null
Pop-Location
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -CompressionLevel Fastest

# 2. Zip deploy through Kudu with Entra ID auth; author/deployer/message are
#    stored in the deployment history
$scmHost = if ($Slot -eq "production") { "$AppName.scm.azurewebsites.net" } else { "$AppName-$Slot.scm.azurewebsites.net" }
$token   = az account get-access-token --resource https://management.azure.com --query accessToken -o tsv
$me      = az account show --query user.name -o tsv
$label   = if ($Broken) { "v$Version (contains a bug)" } else { "v$Version" }
$query   = "isAsync=false&deployer=deploy-target.ps1&author=$([uri]::EscapeDataString($me))&message=$([uri]::EscapeDataString("Release $label"))"
Write-Host "== Deploying orders-svc $label to $Slot" -ForegroundColor Cyan
Invoke-WebRequest -Method Post -Uri "https://$scmHost/api/zipdeploy?$query" -InFile $zip `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/zip" -TimeoutSec 600 | Out-Null

# 3. Wait for the slot to serve the new version
$base = if ($Slot -eq "production") { "https://$AppName.azurewebsites.net" } else { "https://$AppName-$Slot.azurewebsites.net" }
for ($i = 0; $i -lt 30; $i++) {
  try { $h = Invoke-RestMethod "$base/api/health" -TimeoutSec 20 } catch { $h = $null }
  if ($h.version -eq $Version) { break }
  Start-Sleep 10
}
Write-Host "   $Slot now serves: $($h | ConvertTo-Json -Compress)"

# 4. Optional swap staging -> production
if ($Swap) {
  Write-Host "== Swapping staging -> production" -ForegroundColor Cyan
  az functionapp deployment slot swap -g $ResourceGroup -n $AppName --slot staging --target-slot production -o none
  $p = Invoke-RestMethod "https://$AppName.azurewebsites.net/api/health"
  $s = Invoke-RestMethod "https://$AppName-staging.azurewebsites.net/api/health"
  Write-Host "   production: v$($p.version)   staging: v$($s.version)" -ForegroundColor Green
}
