# Building and signing the Windows installer

This app is packaged for exactly one client, installed by hand — not
distributed publicly — so it uses a **free self-signed code-signing
certificate** instead of a paid CA certificate (EV/OV) or a Microsoft
Trusted Signing subscription. This doc covers generating that certificate,
rebuilding/re-signing the installer, and what to actually expect from
Windows Defender SmartScreen.

## One-time setup: generate the certificate

Already done once (certificate issued to `CN=Hatem Telli`, valid 5 years,
expires 2031-07-22). The files live in `certs/` at the repo root and are
**gitignored** — they must never be committed:

- `certs/logistics-dashboard.pfx` — private key + cert, used for signing
- `certs/logistics-dashboard.cer` — public cert only, bundled into the
  installer so it can be trusted on the target machine
- `certs/codesign.local.env` — holds `CSC_LINK` / `CSC_KEY_PASSWORD` for
  electron-builder to find the `.pfx` and its password automatically

If you ever need to regenerate it (e.g. before the 5-year expiry, or for a
different publisher name), run in PowerShell from the repo root:

```powershell
New-Item -ItemType Directory -Force -Path certs | Out-Null

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Your Name Here" `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(5) `
  -FriendlyName "Logistics Financial Dashboard Code Signing"

Add-Type -AssemblyName System.Web
$plainPwd = [System.Web.Security.Membership]::GeneratePassword(24, 6)
$securePwd = ConvertTo-SecureString -String $plainPwd -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath certs\logistics-dashboard.pfx `
  -Password $securePwd -ChainOption EndEntityCertOnly
Export-Certificate -Cert $cert -FilePath certs\logistics-dashboard.cer -Type CERT

@"
CSC_LINK=certs/logistics-dashboard.pfx
CSC_KEY_PASSWORD=$plainPwd
"@ | Set-Content -Path certs\codesign.local.env -Encoding utf8 -NoNewline
```

If you change the certificate's `Subject` name, also update the name in
`build/installer.nsh`'s `customUnInstall` macro (`certutil -delstore`
matches against it).

## Building a signed installer

```powershell
npm run release:win
```

This loads `certs/codesign.local.env` into the environment and runs the
existing `package:win` script (falling back automatically to a workaround
if it hits the antivirus lock described below). electron-builder
auto-detects `CSC_LINK` / `CSC_KEY_PASSWORD` and signs the NSIS installer
automatically — no other config needed. The build also:

- bundles `certs/logistics-dashboard.cer` as an extra resource
- runs a custom NSIS step (`build/installer.nsh`) on install that silently
  imports that certificate into the **current Windows user's** `Root` and
  `TrustedPublisher` stores via `certutil -user -addstore` (no admin
  elevation needed, matching `perMachine: false`), and removes it again on
  uninstall

If you don't have `certs/codesign.local.env` (e.g. a fresh clone), the
script warns and builds an **unsigned** installer instead of failing.

### Known issue on this machine: antivirus blocks the first build attempt

`better-sqlite3` needed bumping to `^13.0.1` (from `^11.8.2`) — the older
native bindings don't compile against the V8 headers that ship with
Electron 42. Already fixed in `package.json`.

Separately, this machine's antivirus real-time protection holds a
persistent lock on the freshly-extracted Electron distribution folder
(`release/win-unpacked.tmp`), which blocks electron-builder's normal
rename-into-place step with `EPERM: operation not permitted, rename`.
This isn't a timing fluke — it was confirmed to persist for 3+ minutes of
retries, and reproduces with a bare `Expand-Archive` extraction unrelated
to electron-builder. Deleting files/folders works fine; only the rename
of the ~300MB, 75-file Electron folder is blocked.

`scripts/release-win.ps1` handles this automatically: it tries the normal
build first, and if that fails, extracts electron-builder's already-cached
Electron zip (`%LOCALAPPDATA%\electron\Cache`) into `.electron-dist-cache/`
(gitignored) and rebuilds using electron-builder's `electronDist` option,
which **copies** files into place instead of renaming a folder — sidesteps
the lock entirely. You'll see two build passes in the output when this
kicks in; that's expected. This is a workaround, not a fix — modifying
Windows Defender exclusions would be the real fix but requires admin
rights and is a security-setting change outside what this script does
automatically.

## Verifying the signature

```powershell
$sig = Get-AuthenticodeSignature "release\Logistics Financial Dashboard Setup 1.0.0.exe"
$sig | Format-List *
```

- Before the certificate is trusted anywhere on the machine you're
  checking from: `Status` will read `UnknownError` ("terminated in a root
  certificate which is not trusted") — expected for a self-signed chain,
  and does **not** mean the signature is broken.
- After running `certutil -user -addstore Root certs\logistics-dashboard.cer`
  (or after actually running the installer, which does this automatically):
  `Status` should read `Valid`.

  Note: a self-signed certificate is its own root, so it must land in the
  **Root** store (Trusted Root Certification Authorities), not just
  `TrustedPublisher`, for Authenticode chain validation to pass — verified
  empirically while building this. `build/installer.nsh` adds it to both.
  The certificate's Enhanced Key Usage is restricted to Code Signing only
  (confirmed via `certutil -dump`), so this doesn't grant it any broader
  authority (e.g. it cannot be used to trust TLS/HTTPS certificates) even
  though it sits in the Root store.

## Before handing the installer to the client

Only `.env.example` is bundled with the app (by design — real secrets never
get committed or packaged). After installing on the client's machine, copy
a real `.env` (with `APP_PASSWORD` and `SESSION_SECRET` set) into the
installed `resources\` folder, next to `.env.example`
(`%LOCALAPPDATA%\Programs\Logistics Financial Dashboard\resources\.env`)
— otherwise the login screen will show "لم يتم إعداد كلمة المرور على
الخادم بعد" (password not configured) and nobody can log in.

## The SmartScreen caveat — read this before promising anything to the client

Signing removes the generic **"Unknown Publisher"** warning and shows
"Hatem Telli" as the verified publisher instead. That's a real, meaningful
improvement.

However, Windows SmartScreen's **"Windows protected your PC"** banner is
driven by a separate, cloud-based Microsoft reputation service tied to the
file/publisher's download history — not by local certificate trust. A
brand-new self-signed certificate has zero reputation with that service.
Since the installer will be delivered by email/cloud link (confirmed with
the user), Windows will attach "Mark of the Web" to the downloaded file,
and SmartScreen **may still show a prompt the first time regardless of
signing** — this cannot be fully eliminated without a paid, CA-issued
certificate (EV, or Microsoft Trusted Signing) that has established
reputation.

Practical expectations to set with the client:
- The scary "Unknown Publisher" wording will be gone; it'll show your name.
- If SmartScreen still appears, the fix is one click: **"More info" → "Run
  anyway"** — this only needs to happen once per machine.
- The only way to fully confirm whether the prompt appears at all is to
  test the actual delivered file, via the actual delivery method (email/
  cloud download), on a machine that's never seen it before — this can't
  be verified from the development machine.
