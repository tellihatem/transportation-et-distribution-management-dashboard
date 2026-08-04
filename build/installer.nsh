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

  ; The database lives in the per-user data folder, NOT under $INSTDIR, so a
  ; normal uninstall leaves it behind and the next install re-opens the same
  ; records. Offer to remove it, defaulting to "No" so an accidental yes-click
  ; can't destroy real business data.
  ;
  ; Skipped entirely on a silent uninstall: electron-builder runs one of those
  ; as part of an in-place upgrade, where wiping the user's data would be wrong.
  IfSilent skip_appdata_cleanup
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "هل تريد أيضاً حذف قاعدة البيانات وجميع السجلات المحفوظة؟$\n$\nاختر «لا» للاحتفاظ ببياناتك." \
    IDNO skip_appdata_cleanup
  DetailPrint "حذف قاعدة البيانات وبيانات التطبيق..."
  RMDir /r "$APPDATA\logistics-financial-dashboard"
  skip_appdata_cleanup:
!macroend
