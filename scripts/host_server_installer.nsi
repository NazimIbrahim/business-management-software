; ============================================================================
; NSIS Script for AMA Ceramics Quotation Central Host Server Setup
; Generates: AMA-Ceramics-Host-Server-Setup-1.0.0.exe
; ============================================================================

!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "AMA Ceramics Quotation Host Server"
OutFile "..\client\release\AMA-Ceramics-Host-Server-Setup-2.4.17.exe"
InstallDir "C:\AMA-Ceramics-Host-Server"
InstallDirRegKey HKLM "Software\AMACeramics\HostServer" "Install_Dir"
RequestExecutionLevel admin

; Interface Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_HEADERIMAGE
!define MUI_WELCOMEPAGE_TITLE "AMA Ceramics Quotation Host Server Setup"
!define MUI_WELCOMEPAGE_TEXT "This setup wizard will install and automatically configure the Central LAN Host Server for AMA Ceramics Quotation Management System.$\r$\n$\r$\nIt will configure:$\r$\n - Central Node.js API Service$\r$\n - PostgreSQL 16 Database and Schema$\r$\n - Windows Firewall Inbound Rules (Port 4000)$\r$\n - Automatic Windows Background Boot Service$\r$\n$\r$\nClick Next to continue."

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "Host Server Setup Complete"
!define MUI_FINISHPAGE_TEXT "The AMA Ceramics Quotation Central Host Server has been installed and configured.$\r$\n$\r$\nThe server is now running in the background and will automatically start whenever this PC boots up.$\r$\n$\r$\nA management shortcut 'AMA Host Server Control' has been created on your Desktop."
!define MUI_FINISHPAGE_RUN "$INSTDIR\scripts\manage_host_server.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Open Host Server Control Panel"
!insertmacro MUI_PAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

Section "Install Host Server Files" SecMain
    ; Stop existing host server service to prevent file locks during overwrite
    DetailPrint "Stopping existing background service..."
    nsExec::Exec 'schtasks /end /tn "AMACeramicsServer"'
    nsExec::Exec 'taskkill /F /IM node.exe'
    Sleep 1000

    SetOutPath "$INSTDIR"
    
    ; Copy root launchers and docs
    File "..\Setup-Host-Server.bat"
    File "..\README.md"
    
    ; Copy server directory
    SetOutPath "$INSTDIR\server"
    File "..\server\package.json"
    File "..\server\package-lock.json"
    File "..\server\.env.example"
    
    SetOutPath "$INSTDIR\server\dist"
    File /r "..\server\dist\*.*"
    
    SetOutPath "$INSTDIR\server\bin"
    File "..\server\bin\node.exe"
    
    SetOutPath "$INSTDIR\server\src\db"
    File "..\server\src\db\schema.sql"
    
    SetOutPath "$INSTDIR\server\node_modules"
    File /r "..\server\node_modules\*.*"
    
    ; Copy scripts
    SetOutPath "$INSTDIR\scripts"
    File "..\scripts\setup_host_server.ps1"
    File "..\scripts\manage_host_server.bat"
    File "..\scripts\backup_database.bat"
    File "..\scripts\setup_firewall.bat"
    File "..\scripts\start_server.bat"
    
    ; Write Registry Keys for Installation and Uninstaller
    WriteRegStr HKLM "Software\AMACeramics\HostServer" "Install_Dir" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMACeramicsHostServer" "DisplayName" "AMA Ceramics Quotation Host Server"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMACeramicsHostServer" "UninstallString" '"$INSTDIR\uninstall.exe"'
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMACeramicsHostServer" "DisplayVersion" "2.4.5"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMACeramicsHostServer" "Publisher" "AMA Ceramics Pvt Ltd"
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    ; Run the automated setup script
    DetailPrint "Configuring PostgreSQL, Firewall, and Background Scheduled Task..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\setup_host_server.ps1" -Unattended'

    ; Start the background service
    DetailPrint "Starting AMA Ceramics Host Server..."
    nsExec::Exec 'schtasks /run /tn "AMACeramicsServer"'
    
    ; Create Start Menu Shortcuts
    CreateDirectory "$SMPROGRAMS\AMA Ceramics Host Server"
    CreateShortcut "$SMPROGRAMS\AMA Ceramics Host Server\AMA Host Server Control.lnk" "$INSTDIR\scripts\manage_host_server.bat" "" "$INSTDIR\scripts\manage_host_server.bat" 0
    CreateShortcut "$SMPROGRAMS\AMA Ceramics Host Server\Uninstall Host Server.lnk" "$INSTDIR\uninstall.exe"
    
    ; Create Desktop Shortcut
    CreateShortcut "$DESKTOP\AMA Host Server Control.lnk" "$INSTDIR\scripts\manage_host_server.bat" "" "$INSTDIR\scripts\manage_host_server.bat" 0
SectionEnd

Section "Uninstall"
    ; Stop and delete scheduled task
    nsExec::Exec 'schtasks /delete /tn "AMACeramicsServer" /f'
    
    ; Delete Firewall rule
    nsExec::Exec 'netsh advfirewall firewall delete rule name="AMA Ceramics Quotation Server (TCP 4000)"'
    
    ; Remove shortcuts
    Delete "$DESKTOP\AMA Host Server Control.lnk"
    RMDir /r "$SMPROGRAMS\AMA Ceramics Host Server"
    
    ; Remove Registry entries
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMACeramicsHostServer"
    DeleteRegKey HKLM "Software\AMACeramics\HostServer"
    
    ; Remove Files
    RMDir /r "$INSTDIR"
SectionEnd
