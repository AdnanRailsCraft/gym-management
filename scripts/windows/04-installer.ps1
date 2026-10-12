# 04-installer.ps1 — compile installer\gym-management.iss with Inno Setup.
# Finds ISCC.exe; installs via Chocolatey if absent. Output: dist\GymManagementSystem-Setup-<version>.exe
param(
    [string]$StageRoot = "",
    [string]$OutputDir = "",
    [string]$IssPath = ""
)

. (Join-Path $PSScriptRoot "lib.ps1")
Set-Location (Join-Path $PSScriptRoot "..\..")

if ([string]::IsNullOrEmpty($StageRoot)) { $StageRoot = Join-Path (Get-Location) "dist\stage" }
if ([string]::IsNullOrEmpty($OutputDir)) { $OutputDir = Join-Path (Get-Location) "dist" }
if ([string]::IsNullOrEmpty($IssPath)) { $IssPath = Join-Path (Get-Location) "installer\gym-management.iss" }

# --- locate ISCC ----------------------------------------------------------
function Find-ISCC {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

$iscc = Find-ISCC
Write-Check "inno_setup_found" ($null -ne $iscc) $(if ($iscc) { $iscc } else { "not on PATH; will try choco" })

if ($null -eq $iscc) {
    $choco = Get-Command "choco" -ErrorAction SilentlyContinue
    if ($choco) {
        Write-Host "Installing Inno Setup via Chocolatey..."
        $install = Invoke-Tool -FilePath "choco" -ArgumentList @("install", "innosetup", "-y", "--no-progress")
        Write-Check "inno_setup_choco_install" ($install.ExitCode -eq 0) (($install.Output.Trim() -split "`n" | Select-Object -Last 1))
        $iscc = Find-ISCC
        Write-Check "inno_setup_found_after_choco" ($null -ne $iscc) $(if ($iscc) { $iscc } else { "still missing" })
    } else {
        Write-Check "inno_setup_choco_install" $false "choco not available"
    }
}

if ($null -eq $iscc) { exit (Get-GmsExitCode) }

# --- preconditions --------------------------------------------------------
Write-Check "stage_tree_present" (Test-Path (Join-Path $StageRoot "desktop\gym-desktop.exe")) $StageRoot
Write-Check "iss_script_present" (Test-Path $IssPath) $IssPath

# --- compile --------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$isccArgs = @(
    "/DStageDir=$StageRoot",
    "/DOutputDir=$OutputDir",
    $IssPath
)
$build = Invoke-Tool -FilePath $iscc -ArgumentList $isccArgs
Write-Check "isscc_compile" ($build.ExitCode -eq 0) (($build.Output.Trim() -split "`n" | Select-Object -Last 2) -join " | ")

$setupExe = Join-Path $OutputDir "GymManagementSystem-Setup-0.1.0.exe"
$setupOk = Test-Path $setupExe
$setupSize = if ($setupOk) { (Get-Item $setupExe).Length } else { 0 }
Write-Check "setup_exe_created" ($setupOk -and $setupSize -gt 5MB) ("size=$setupSize path=$setupExe")

exit (Get-GmsExitCode)
