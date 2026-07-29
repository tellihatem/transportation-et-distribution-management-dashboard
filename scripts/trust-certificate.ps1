# scripts/trust-certificate.ps1
#
# One-time helper to run ON THE CLIENT'S MACHINE after installing the app.
# Adds the app's self-signed code-signing certificate to the current user's
# Trusted Root store so Windows fully validates the app's signature.
#
# Windows deliberately requires a consent dialog for this (you'll see a
# "Security Warning" asking whether to trust this certificate — click Yes).
# That's why the installer can't do it silently and this is a separate step.
#
# Usage (right-click > Run with PowerShell, or):
#   powershell -ExecutionPolicy Bypass -File scripts\trust-certificate.ps1

$ErrorActionPreference = 'Stop'

# Prefer the certificate shipped inside the installed app; fall back to the
# repo copy when running from a development checkout.
$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Logistics Financial Dashboard\resources\logistics-dashboard.cer'),
  (Join-Path $PSScriptRoot '..\certs\logistics-dashboard.cer')
)

$cerPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $cerPath) {
  Write-Error "Could not find logistics-dashboard.cer. Install the app first, or run this from the project folder."
  exit 1
}

Write-Host "Using certificate: $cerPath"
Write-Host "A Windows security prompt will appear - choose Yes to trust the certificate."

& certutil -user -addstore Root "$cerPath"

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done. The app's signature will now validate as trusted on this machine."
} else {
  Write-Warning "certutil exited with code $LASTEXITCODE (the prompt may have been declined)."
}
