; build/installer.nsh — electron-builder's default nsis.include path.
;
; Registers our self-signed code-signing certificate in the current user's
; "Trusted Publishers" store so Windows recognizes the publisher name.
; Runs per-user (no elevation) to match nsis.perMachine: false.
;
; Deliberately does NOT touch the Trusted Root store: Windows always requires
; an interactive consent dialog to install a root certificate and refuses to
; do it silently ("UI is not allowed in this operation"), which HANGS a silent
; install indefinitely. Establishing full chain trust is therefore a separate,
; one-time manual step — run scripts/trust-certificate.ps1 on the target
; machine. See docs/BUILD_AND_SIGN.md.

!macro customInstall
  DetailPrint "تسجيل شهادة التوقيع الرقمي..."
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -addstore TrustedPublisher "$INSTDIR\resources\logistics-dashboard.cer"'
  Pop $0
  ${if} $0 != 0
    DetailPrint "certutil exited with code $0 (non-fatal — continuing installation)"
  ${endIf}
!macroend

!macro customUnInstall
  DetailPrint "إزالة شهادة التوقيع الرقمي..."
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -delstore TrustedPublisher "Hatem Telli"'
  Pop $0
!macroend
