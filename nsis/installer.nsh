!macro customInstall
  ; Remove old SWX-Manager (com.swaffx.swxmanager) installation entries
  DeleteRegKey HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.swaffx.swxmanager"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.swaffx.swxmanager"
  DeleteRegKey HKCU "SOFTWARE\swaffX\SWX-Manager"
  DeleteRegKey HKLM "SOFTWARE\swaffX\SWX-Manager"
  ; Refresh Windows icon cache so Start Menu shows the updated app icon
  ExecWait '"$SYSDIR\ie4uinit.exe" -show'
!macroend
