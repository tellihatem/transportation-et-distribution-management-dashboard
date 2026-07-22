; build/installer.nsh — electron-builder's default nsis.include path.
;
; Registers our self-signed code-signing certificate as trusted for the
; current Windows user, so Authenticode recognizes the installer's signature
; instead of showing "Unknown Publisher". Runs per-user (no elevation) to
; match nsis.perMachine: false.
;
; A self-signed certificate is its own root, so Windows only reports the
; Authenticode signature as "Valid" once this exact cert is present in the
; user's Trusted Root store (TrustedPublisher alone is not sufficient for
; that check, verified empirically during setup). The certificate's
; Enhanced Key Usage is restricted to Code Signing only (no TLS/server auth,
; no general CA capability), so this grants no broader trust than intended.

!macro customInstall
  DetailPrint "Registering code-signing certificate as trusted..."
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -addstore Root "$INSTDIR\resources\logistics-dashboard.cer"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -addstore TrustedPublisher "$INSTDIR\resources\logistics-dashboard.cer"'
  Pop $0
  ${if} $0 != 0
    DetailPrint "certutil exited with code $0 (non-fatal — continuing installation)"
  ${endIf}
!macroend

!macro customUnInstall
  DetailPrint "Removing code-signing certificate from trust stores..."
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -delstore Root "Hatem Telli"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -delstore TrustedPublisher "Hatem Telli"'
  Pop $0
!macroend
