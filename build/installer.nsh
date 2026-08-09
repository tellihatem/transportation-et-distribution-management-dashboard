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

; Refuse to install alongside a copy that lives somewhere else.
;
; Installs are per-user (perMachine: false), so a previous install is located
; through HKCU. Running this installer elevated, or from a second Windows
; account, looks at a different HKCU and therefore misses it — producing a
; second parallel copy. Each Windows account also has its own %APPDATA%, so
; the two copies read different databases, and the client sees records they
; thought were deleted. Better to stop and say so than to install quietly.
; Runs after initMultiUser, so $INSTDIR is already resolved here.
!macro customInit
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${if} $R9 == ""
    ReadRegStr $R9 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${endIf}

  ${if} $R9 != ""
  ${andif} $R9 != "$INSTDIR"
    MessageBox MB_OK|MB_ICONSTOP \
      "التطبيق مثبت مسبقاً في مجلد آخر:$\n$R9$\n$\nالرجاء إزالته أولاً من «التطبيقات والميزات»، ثم إعادة تشغيل هذا المثبّت.$\n$\nملاحظة: لا تشغّل المثبّت بخيار «تشغيل كمسؤول»."
    Abort
  ${endIf}
!macroend

; Shared body for the two uninstall-result hooks below.
;
; The default handler prints a line and CONTINUES when the old uninstaller
; cannot even be launched, so new files land on top of old ones and the result
; is a half-upgraded install that still behaves like the old build.
;
; electron-builder's handleUninstallResult returns immediately after inserting
; either hook, so aborting is entirely this macro's responsibility — dropping
; the Quit calls would make partial upgrades silent again.
!macro verifyOldVersionRemoved
  ${if} ${errors}
    MessageBox MB_OK|MB_ICONSTOP \
      "تعذّر إزالة النسخة السابقة من التطبيق.$\n$\nأغلق التطبيق إن كان مفتوحاً ثم أعد تشغيل المثبّت.$\n$\nلم يتم تثبيت أي تحديث."
    SetErrorLevel 2
    Quit
  ${endIf}

  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP \
      "فشلت إزالة النسخة السابقة (رمز الخطأ $R0).$\n$\nأغلق التطبيق ثم أعد المحاولة. لم يتم تثبيت أي تحديث."
    SetErrorLevel 2
    Quit
  ${endIf}
!macroend

; Both hooks must be defined: handleUninstallResult dispatches on which
; registry root the old install was found under, and whichever hook is missing
; falls through to the permissive default.
!macro customUnInstallCheck
  !insertmacro verifyOldVersionRemoved
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro verifyOldVersionRemoved
!macroend

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
