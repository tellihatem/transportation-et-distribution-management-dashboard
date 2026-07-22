# scripts/release-win.ps1
# Loads code-signing credentials from the untracked certs/codesign.local.env
# file (if present) and then builds+signs the Windows installer.
#
# On this machine, antivirus real-time protection holds a persistent lock
# on the freshly-extracted Electron distribution folder, which blocks
# electron-builder's normal rename-into-place step (EPERM). If the standard
# build fails, this script automatically retries using a pre-extracted copy
# of Electron via electron-builder's `electronDist` option (which copies
# files instead of renaming the folder). See docs/BUILD_AND_SIGN.md.

$envFile = Join-Path $PSScriptRoot "..\certs\codesign.local.env"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_ -split '=', 2
    if ($parts.Length -eq 2) {
      Set-Item -Path ("Env:" + $parts[0].Trim()) -Value $parts[1].Trim()
    }
  }
  Write-Host "[release:win] Loaded signing credentials from $envFile"
} else {
  Write-Warning "[release:win] $envFile not found - building UNSIGNED."
}

Write-Host "[release:win] Building (standard electron-builder flow)..."
npm run package:win
if ($LASTEXITCODE -eq 0) {
  Write-Host "[release:win] Build succeeded."
  exit 0
}

Write-Warning "[release:win] Standard build failed (exit $LASTEXITCODE). Retrying with a pre-extracted Electron distribution to work around a persistent AV lock on the freshly-extracted Electron folder (see docs/BUILD_AND_SIGN.md)."

$electronPkgPath = Join-Path $PSScriptRoot "..\node_modules\electron\package.json"
$electronVersion = (Get-Content $electronPkgPath | ConvertFrom-Json).version
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
$zipName = "electron-v$electronVersion-win32-x64.zip"
$zipPath = Get-ChildItem -Path $cacheRoot -Filter $zipName -Recurse -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $zipPath) {
  Write-Error "[release:win] Could not find cached $zipName under $cacheRoot (the failed attempt above should have downloaded it). Check your internet connection and try again."
  exit 1
}

$distDir = Join-Path $PSScriptRoot "..\.electron-dist-cache\win32-x64"
if (Test-Path $distDir) {
  try {
    Remove-Item -Recurse -Force $distDir -ErrorAction Stop
  } catch {
    Write-Warning "[release:win] Could not fully clear $distDir ($($_.Exception.Message)) - extracting over existing files instead."
  }
}
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $distDir -Force
Write-Host "[release:win] Extracted Electron $electronVersion to $distDir"

npm run build:electron
npx electron-builder --win --config electron-builder.yml "-c.electronDist=.electron-dist-cache/win32-x64"
exit $LASTEXITCODE
