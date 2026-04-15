Unicode true
RequestExecutionLevel admin

!include MUI2.nsh
!include LogicLib.nsh

!ifndef SOURCE_DIR
  !error "SOURCE_DIR is required"
!endif

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "LumeSync Teacher Native Setup.exe"
!endif

!define APP_NAME "LumeSync Teacher"
!define APP_PUBLISHER "LumeSync"
!define APP_EXE "LumeSyncTeacherShell.exe"
!define REG_UNINSTALL "Software\Microsoft\Windows\CurrentVersion\Uninstall\LumeSyncTeacherNative"

Name "${APP_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$PROGRAMFILES64\LumeSync Teacher"
InstallDirRegKey HKLM "${REG_UNINSTALL}" "InstallLocation"
BrandingText "LumeSync Teacher"
ShowInstDetails show
ShowUninstDetails show

!define MUI_ICON "icon-teacher.ico"
!define MUI_UNICON "icon-teacher.ico"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Install" SecInstall
  SetShellVarContext all

  DetailPrint "Stopping running teacher processes..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "LumeSync Teacher.exe"'
  Sleep 1000

  ${If} ${FileExists} "$INSTDIR"
    DetailPrint "Preparing existing installation directory..."
    nsExec::ExecToLog 'takeown.exe /F "$INSTDIR" /R /D Y'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /setowner *S-1-5-32-544 /T /C'
    nsExec::ExecToLog 'icacls.exe "$INSTDIR" /inheritance:e /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-1-0:(OI)(CI)RX /T /C'
    nsExec::ExecToLog 'attrib.exe -R -S -H "$INSTDIR\*" /S /D'
    RMDir /r /REBOOTOK "$INSTDIR\server"
    RMDir /r /REBOOTOK "$INSTDIR\public"
    RMDir /r /REBOOTOK "$INSTDIR\shared"
    RMDir /r /REBOOTOK "$INSTDIR\packages"
    RMDir /r /REBOOTOK "$INSTDIR\core"
    RMDir /r /REBOOTOK "$INSTDIR\node_modules"
    RMDir /r /REBOOTOK "$INSTDIR\common"
    Delete /REBOOTOK "$INSTDIR\node.exe"
    Delete /REBOOTOK "$INSTDIR\Uninstall.exe"
    Delete /REBOOTOK "$INSTDIR\${APP_EXE}"
    Delete /REBOOTOK "$INSTDIR\WebView2Loader.dll"
  ${EndIf}

  DetailPrint "Installing files..."
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"

  DetailPrint "Preparing shared configuration directory..."
  CreateDirectory "$COMMONFILES\LumeSync Teacher"
  CreateDirectory "$COMMONFILES\LumeSync Teacher\logs"
  CreateDirectory "$COMMONFILES\LumeSync Teacher\webview2"

  DetailPrint "Writing uninstaller..."
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  DetailPrint "Creating shortcuts..."
  CreateDirectory "$SMPROGRAMS\LumeSync"
  CreateShortCut "$SMPROGRAMS\LumeSync\LumeSync Teacher.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$DESKTOP\LumeSync Teacher.lnk" "$INSTDIR\${APP_EXE}"

  DetailPrint "Writing uninstall registry keys..."
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "${REG_UNINSTALL}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${REG_UNINSTALL}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKLM "${REG_UNINSTALL}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoModify" 1
  WriteRegDWORD HKLM "${REG_UNINSTALL}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext all

  DetailPrint "Stopping teacher process..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM "${APP_EXE}"'

  DetailPrint "Removing shortcuts..."
  Delete "$SMPROGRAMS\LumeSync\LumeSync Teacher.lnk"
  Delete "$DESKTOP\LumeSync Teacher.lnk"
  RMDir "$SMPROGRAMS\LumeSync"

  DetailPrint "Removing application files..."
  RMDir /r "$INSTDIR"

  DetailPrint "Removing registry keys..."
  DeleteRegKey HKLM "${REG_UNINSTALL}"
SectionEnd
