# scripts/release-win.ps1
# Builds, signs and verifies the Windows installer.
#
# Every artifact this produces is uniquely named: <version>-<build stamp>.
# That is deliberate. Builds used to all be called
# "Logistics Financial Dashboard Setup 1.0.0.exe", so a cloud link could serve
# a cached older copy and nobody — not us, not the client — could tell. The
# preflight checks below exist to make that situation impossible to recreate.
#
# On this machine, antivirus real-time protection holds a persistent lock
# on the freshly-extracted Electron distribution folder, which blocks
# electron-builder's normal rename-into-place step (EPERM). If the standard
# build fails, this script automatically retries using a pre-extracted copy
# of Electron via electron-builder's `electronDist` option (which copies
# files instead of renaming the folder). See docs/BUILD_AND_SIGN.md.

param(
  # Build from an uncommitted tree. The build id and the filename are both
  # stamped "-dirty" so such a build can never be mistaken for a clean release.
  [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Fail($message) {
  Write-Host ""
  Write-Host "[release:win] ABORTED — $message" -ForegroundColor Red
  Write-Host ""
  exit 1
}

# ─────────────────────────────────────────────────────────────
# Preflight — refuse to build anything ambiguous
# ─────────────────────────────────────────────────────────────

# 1. A stray installer at the repo root is exactly the stale-copy mistake:
#    two files with the same name, one of them months old, either of which
#    might get uploaded.
$strayExe = Get-ChildItem -Path $repoRoot -Filter '*.exe' -File -ErrorAction SilentlyContinue
if ($strayExe) {
  Fail ("installer(s) found at the repo root: " + ($strayExe.Name -join ', ') + ".`n" +
        "  These go stale and get shipped by mistake. Delete them; the only`n" +
        "  shippable installer lives in release/.")
}

# 2. Every shipped version gets a git tag, so a tag that already exists means
#    this version has been released. Bump it rather than silently replacing.
$version = (Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
$existingTag = & git -C $repoRoot tag --list "v$version"
if ($existingTag) {
  Fail ("version $version already shipped (git tag v$version exists).`n" +
        "  Bump it first:  npm version minor")
}

# 3. A build from uncommitted work cannot be traced back to a commit.
$dirty = [bool](& git -C $repoRoot status --porcelain)
if ($dirty -and -not $AllowDirty) {
  Fail ("working tree has uncommitted changes.`n" +
        "  Commit them, or re-run with -AllowDirty to stamp the build '-dirty'.")
}

# 4. Compute the stamp once and hand it to both build passes via the
#    environment, so whichever pass succeeds produces identical metadata.
$gitCommit = (& git -C $repoRoot rev-parse --short HEAD) 2>$null
if (-not $gitCommit) { $gitCommit = 'nogit' }
$buildTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$stamp     = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm')
$buildId   = "$stamp-$gitCommit" + $(if ($dirty) { '-dirty' } else { '' })

$env:BUILD_ID   = $buildId
$env:BUILD_TIME = $buildTime

Write-Host "[release:win] Version  : $version"
Write-Host "[release:win] Build id : $buildId"

# 5. Clear previous artifacts, keeping electron-builder's .cache (NSIS
#    resources — deleting it just forces a re-download). A leftover .exe is
#    the ambiguity being eliminated, so treat one as fatal.
$releaseDir = Join-Path $repoRoot 'release'
if (Test-Path $releaseDir) {
  Get-ChildItem -Path $releaseDir -Exclude '.cache' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  $leftover = Get-ChildItem -Path $releaseDir -Filter '*.exe' -File -ErrorAction SilentlyContinue
  if ($leftover) {
    Fail ("could not clear old installer(s) from release/: " + ($leftover.Name -join ', ') + ".`n" +
          "  Close anything holding them open and retry.")
  }
}

# ─────────────────────────────────────────────────────────────
# Signing credentials
# ─────────────────────────────────────────────────────────────

$signingLoaded = $false
$envFile = Join-Path $repoRoot 'certs\codesign.local.env'

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_ -split '=', 2
    if ($parts.Length -eq 2) {
      Set-Item -Path ("Env:" + $parts[0].Trim()) -Value $parts[1].Trim()
    }
  }
  $signingLoaded = $true
  Write-Host "[release:win] Loaded signing credentials from $envFile"
} else {
  Write-Warning "[release:win] $envFile not found - building UNSIGNED."
}

# ─────────────────────────────────────────────────────────────
# Post-build: rename, verify, record
# Called by BOTH build paths, so verification cannot be skipped by whichever
# one happens to succeed.
# ─────────────────────────────────────────────────────────────

function Complete-Release {
  $built = Join-Path $releaseDir "Logistics-Dashboard-Setup-$version.exe"
  if (-not (Test-Path $built)) {
    Fail "build reported success but $built does not exist."
  }

  # Renaming after signing is safe: Authenticode covers the file's contents,
  # not its name.
  $finalName = "Logistics-Dashboard-Setup-$version-$buildId.exe"
  $final     = Join-Path $releaseDir $finalName
  Move-Item -Path $built -Destination $final -Force

  $hash = (Get-FileHash -Algorithm SHA256 -Path $final).Hash
  $size = (Get-Item $final).Length

  # Signature check. A correctly-signed self-signed binary reports
  # 'UnknownError' on any machine that does not trust the root — including
  # this one (docs/BUILD_AND_SIGN.md). So test for genuinely-unsigned output
  # and for the expected signer; testing for 'Valid' would fail every build.
  $sig = Get-AuthenticodeSignature $final
  if ($signingLoaded) {
    if ($sig.Status -eq 'NotSigned') {
      Fail "signing credentials were loaded but the installer came out unsigned."
    }
    if ($sig.SignerCertificate -and $sig.SignerCertificate.Subject -notmatch 'Hatem Telli') {
      Fail "installer signed by an unexpected certificate: $($sig.SignerCertificate.Subject)"
    }
  }

  # Paste-able record of exactly what was produced.
  $notes = @"
Logistics Financial Dashboard
-----------------------------
Version    : $version
Build id   : $buildId
Git commit : $gitCommit
Dirty tree : $dirty
Built (UTC): $buildTime
File       : $finalName
SHA-256    : $hash
Size       : $size bytes
Signature  : $($sig.Status)

Install this file, open the app, and check the badge in the top bar:
it must read  الإصدار $version
If there is no version badge at all, an older build is still installed.
"@
  $notesPath = Join-Path $releaseDir "RELEASE-$version-$buildId.txt"
  Set-Content -Path $notesPath -Value $notes -Encoding utf8

  Write-Host ""
  Write-Host "[release:win] Build succeeded." -ForegroundColor Green
  Write-Host "[release:win] Upload exactly this file:" -ForegroundColor Green
  Write-Host "              $final"
  Write-Host "[release:win] SHA-256: $hash"
  Write-Host "[release:win] Notes  : $notesPath"
  Write-Host ""
  Write-Host "[release:win] Next:  git tag v$version && git push --tags"
}

# ─────────────────────────────────────────────────────────────
# Build — standard pass, then the AV-lock fallback
# ─────────────────────────────────────────────────────────────

Write-Host "[release:win] Building (standard electron-builder flow)..."
npm run package:win
if ($LASTEXITCODE -eq 0) {
  Complete-Release
  exit 0
}

Write-Warning "[release:win] Standard build failed (exit $LASTEXITCODE). Retrying with a pre-extracted Electron distribution to work around a persistent AV lock on the freshly-extracted Electron folder (see docs/BUILD_AND_SIGN.md)."

$electronPkgPath = Join-Path $repoRoot 'node_modules\electron\package.json'
$electronVersion = (Get-Content $electronPkgPath | ConvertFrom-Json).version
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
$zipName = "electron-v$electronVersion-win32-x64.zip"
$zipPath = Get-ChildItem -Path $cacheRoot -Filter $zipName -Recurse -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $zipPath) {
  Fail "could not find cached $zipName under $cacheRoot (the failed attempt above should have downloaded it). Check your internet connection and try again."
}

$distDir = Join-Path $repoRoot '.electron-dist-cache\win32-x64'
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
if ($LASTEXITCODE -ne 0) {
  Fail "fallback build also failed (exit $LASTEXITCODE)."
}
Complete-Release
exit 0
