!macro customInstall
  ; Remove old SWX-Manager (com.swaffx.swxmanager) installation entries
  ; so the old entry disappears from Add/Remove Programs after installing Onyx Mods
  DeleteRegKey HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.swaffx.swxmanager"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.swaffx.swxmanager"
  DeleteRegKey HKCU "SOFTWARE\swaffX\SWX-Manager"
  DeleteRegKey HKLM "SOFTWARE\swaffX\SWX-Manager"
!macroend
