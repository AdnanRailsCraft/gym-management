# 03-stage.ps1 — build the portable install tree under dist\stage\:
#   dist\stage\ruby\      portable Ruby runtime (from the active Ruby's TOPDIR)
#   dist\stage\app\       Rails app code + vendor\bundle (deployment gems)
#   dist\stage\desktop\   gym-desktop.exe (Tauri shell binary)
# This tree is what installer\gym-management.iss packages.
# Requires: ruby + bundler on PATH (same version as .ruby-version).
param(
    [string]$StageRoot = "",
    [string]$DesktopExe = ""
)

. (Join-Path $PSScriptRoot "lib.ps1")
Set-Location (Join-Path $PSScriptRoot "..\..")

if ([string]::IsNullOrEmpty($StageRoot)) { $StageRoot = Join-Path (Get-Location) "dist\stage" }
if ([string]::IsNullOrEmpty($DesktopExe)) { $DesktopExe = Join-Path (Get-Location) "desktop\src-tauri\target\release\gym-desktop.exe" }

# --- clean stage tree -----------------------------------------------------
if (Test-Path $StageRoot) { Remove-Item $StageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null
Write-Check "stage_root_created" $true $StageRoot

# --- ruby runtime ---------------------------------------------------------
$rubyTop = (& ruby -rrbconfig -e "print RbConfig::TOPDIR") | Out-String
$rubyTop = $rubyTop.Trim()
$rubyTopOk = ($LASTEXITCODE -eq 0) -and ($rubyTop.Length -gt 0) -and (Test-Path (Join-Path $rubyTop "bin\ruby.exe"))
Write-Check "ruby_topdir_resolved" $rubyTopOk $rubyTop
if (-not $rubyTopOk) { exit (Get-GmsExitCode) }

$rubyDest = Join-Path $StageRoot "ruby"
robocopy $rubyTop $rubyDest /MIR /XD msys64 tmp log /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
# robocopy sets $LASTEXITCODE 0..7 = success (8+ = failure)
$rcCopyOk = $LASTEXITCODE -lt 8
Write-Check "ruby_runtime_staged" $rcCopyOk ("robocopy exit=$LASTEXITCODE from=$rubyTop")
if (-not $rcCopyOk) { exit (Get-GmsExitCode) }
Write-Check "ruby_runtime_entry" (Test-Path (Join-Path $rubyDest "bin\ruby.exe")) "bin\ruby.exe"

# --- app code -------------------------------------------------------------
$appDest = Join-Path $StageRoot "app"
$exclusions = @(".git", "desktop", "dist", "tmp", "log", "scripts", "installer", ".github", "node_modules", "vendor", "coverage", ".bundle")
$rcArgs = @((Get-Location).Path, $appDest, "/MIR", "/XD", "*tmp*", "/NFL", "/NDL", "/NJH", "/NJS", "/R:1", "/W:1")
foreach ($xd in $exclusions) { $rcArgs += @("/XD", $xd) }
robocopy @rcArgs | Out-Null
$codeCopyOk = $LASTEXITCODE -lt 8
Write-Check "app_code_staged" $codeCopyOk ("robocopy exit=$LASTEXITCODE")
if (-not $codeCopyOk) { exit (Get-GmsExitCode) }
Write-Check "app_lockfile_present" (Test-Path (Join-Path $appDest "Gemfile.lock")) "Gemfile.lock"

# --- app gems (portable, deployment layout inside app dir) ----------------
$env:BUNDLE_GEMFILE = Join-Path $appDest "Gemfile"
$bundleCfg = Invoke-Tool -FilePath "bundle" -ArgumentList @("config", "set", "--local", "path", "vendor/bundle")
Write-Check "bundle_config_path" ($bundleCfg.ExitCode -eq 0) ($bundleCfg.Output.Trim())
$bundleCfg2 = Invoke-Tool -FilePath "bundle" -ArgumentList @("config", "set", "--local", "deployment", "true")
Write-Check "bundle_config_deployment" ($bundleCfg2.ExitCode -eq 0) ($bundleCfg2.Output.Trim())
$bundleInstall = Invoke-Tool -FilePath "bundle" -ArgumentList @("install")
$gemsOk = ($bundleInstall.ExitCode -eq 0) -and (Test-Path (Join-Path $appDest "vendor\bundle"))
Write-Check "bundle_install_portable" $gemsOk (($bundleInstall.Output.Trim() -split "`n" | Select-Object -Last 1))
Remove-Item Env:\BUNDLE_GEMFILE -ErrorAction SilentlyContinue

# --- desktop shell --------------------------------------------------------
$desktopDest = Join-Path $StageRoot "desktop"
New-Item -ItemType Directory -Force -Path $desktopDest | Out-Null
if (Test-Path $DesktopExe) {
    Copy-Item $DesktopExe (Join-Path $desktopDest "gym-desktop.exe") -Force
}
$shellOk = Test-Path (Join-Path $desktopDest "gym-desktop.exe")
Write-Check "desktop_shell_staged" $shellOk $DesktopExe

# --- layout contract ------------------------------------------------------
$required = @(
    "ruby\bin\ruby.exe",
    "app\bin\rails",
    "app\config\database.yml",
    "app\db\schema.rb",
    "app\Gemfile.lock",
    "app\vendor\bundle",
    "desktop\gym-desktop.exe"
)
$missing = @()
foreach ($rel in $required) {
    if (-not (Test-Path (Join-Path $StageRoot $rel))) { $missing += $rel }
}
Write-Check "stage_layout_complete" ($missing.Count -eq 0) ("missing=" + ($missing -join ","))

exit (Get-GmsExitCode)
