# 06-sign.ps1 — Phase 0 local code signing for a SINGLE owner-controlled PC.
# Self-signed cert + one-time LocalMachine\Root trust import on that PC.
# Other machines still see SmartScreen warnings (expected; documented §7).
#
# Modes (may combine -CreateCert with nothing else first):
#   -CreateCert     generate self-signed code-signing cert -> dist\signing\ (gitignored)
#   -Files a,b      sign the listed files (Set-AuthenticodeSignature, SHA256, no timestamp)
#   -InstallTrust   import the public CER into Cert:\LocalMachine\Root (admin, one-time)
#
# Password handling (P0): PFX password comes ONLY from env GMS_SIGN_PFX_PASSWORD.
#   -CreateCert: generates a random password, prints it ONCE, exports PFX.
#   Persist it yourself (e.g. `setx GMS_SIGN_PFX_PASSWORD <value>`), never commit it.
param(
    [switch]$CreateCert,
    [switch]$InstallTrust,
    [string[]]$Files = @(),
    [string]$PfxPath = "",
    [string]$CerPath = "",
    [string]$CertDir = ""
)

. (Join-Path $PSScriptRoot "lib.ps1")
Set-Location (Join-Path $PSScriptRoot "..\..")

if ([string]::IsNullOrEmpty($CertDir)) { $CertDir = Join-Path (Get-Location) "dist\signing" }
if ([string]::IsNullOrEmpty($PfxPath)) { $PfxPath = Join-Path $CertDir "gms-local-signing.pfx" }
if ([string]::IsNullOrEmpty($CerPath)) { $CerPath = Join-Path $CertDir "gms-local-signing.cer" }

$subject = "CN=Gym Management System Local"

# --- create cert ----------------------------------------------------------
if ($CreateCert) {
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null

    $existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date).AddDays(30) }
    if ($existing) {
        Write-Check "code_signing_cert_present" $true ("reusing thumbprint=" + $existing[0].Thumbprint)
        $cert = $existing[0]
    } else {
        $cert = New-SelfSignedCertificate `
            -Type CodeSigningCert `
            -Subject $subject `
            -CertStoreLocation Cert:\CurrentUser\My `
            -KeyAlgorithm RSA -KeyLength 2048 `
            -HashAlgorithm SHA256 `
            -NotAfter (Get-Date).AddYears(5) `
            -KeyExportPolicy Exportable
        Write-Check "code_signing_cert_created" $true ("thumbprint=" + $cert.Thumbprint)
    }

    if ([string]::IsNullOrEmpty($env:GMS_SIGN_PFX_PASSWORD)) {
        # generate random password, print ONCE — caller must persist it
        $bytes = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $env:GMS_SIGN_PFX_PASSWORD = [Convert]::ToBase64String($bytes)
        Write-Host ""
        Write-Host "============================================================"
        Write-Host "PFX PASSWORD (shown once, store it now e.g. via setx):"
        Write-Host $env:GMS_SIGN_PFX_PASSWORD
        Write-Host "Persist: setx GMS_SIGN_PFX_PASSWORD <value-above>"
        Write-Host "============================================================"
        Write-Host ""
    }

    $pwd = ConvertTo-SecureString $env:GMS_SIGN_PFX_PASSWORD -AsPlainText -Force
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $pwd | Out-Null
    Export-Certificate -Cert $cert -FilePath $CerPath | Out-Null
    Write-Check "pfx_exported" (Test-Path $PfxPath) $PfxPath
    Write-Check "cer_exported" (Test-Path $CerPath) $CerPath
}

# --- sign files -----------------------------------------------------------
if ($Files.Count -gt 0) {
    if (-not (Test-Path $PfxPath)) {
        Write-Check "pfx_available_for_signing" $false ("missing $PfxPath — run -CreateCert first")
        exit (Get-GmsExitCode)
    }
    if ([string]::IsNullOrEmpty($env:GMS_SIGN_PFX_PASSWORD)) {
        Write-Check "pfx_password_in_env" $false "set GMS_SIGN_PFX_PASSWORD"
        exit (Get-GmsExitCode)
    }
    $pwd = ConvertTo-SecureString $env:GMS_SIGN_PFX_PASSWORD -AsPlainText -Force
    $cert = (Get-PfxData -FilePath $PfxPath -Password $pwd).EndEntityCertificate

    foreach ($f in $Files) {
        if (-not (Test-Path $f)) {
            Write-Check "sign_target_exists" $false $f
            continue
        }
        Write-Check "sign_target_exists" $true $f
        # no timestamp server: gym PC is offline-capable; re-sign after 5y cert expiry
        $result = Set-AuthenticodeSignature -FilePath $f -Certificate $cert -HashAlgorithm SHA256
        Write-Check "signature_applied" ($result.Status -ne "NotSigned") ("status=" + $result.Status)
        $after = Get-AuthenticodeSignature $f
        # before trust-import a self-signed chain reports UnknownError; Valid after -InstallTrust
        $okStatus = $after.Status -in @("Valid", "UnknownError")
        Write-Check "signature_verifiable" $okStatus ("status=" + $after.Status + " signer=" + $after.SignerCertificate.Subject)
    }
}

# --- trust import (admin, one-time, this PC only) -------------------------
if ($InstallTrust) {
    if (-not (Test-Path $CerPath)) {
        Write-Check "cer_available_for_trust" $false ("missing $CerPath")
    } else {
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        Write-Check "admin_for_trust_import" $isAdmin "re-run from elevated shell if false"
        if ($isAdmin) {
            Import-Certificate -FilePath $CerPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
            $trusted = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -eq $subject }
            Write-Check "cert_trusted_local_machine_root" ($null -ne $trusted) ("count=" + @($trusted).Count)
        }
    }
    # re-verify any files passed with -Files after trust
    foreach ($f in $Files) {
        if (-not (Test-Path $f)) { continue }
        $sig = Get-AuthenticodeSignature $f
        Write-Check "signature_valid_after_trust" ($sig.Status -eq "Valid") ("file=$f status=" + $sig.Status)
    }
}

exit (Get-GmsExitCode)
