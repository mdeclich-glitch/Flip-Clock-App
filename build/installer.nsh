; Eseguito dall'installer NSIS di electron-builder (anche ad ogni aggiornamento automatico).
; Crea "Flip Clock.scr" accanto all'exe: per Windows uno screensaver e' un exe rinominato .scr.
; Va tenuto nella cartella di installazione (non in System32), perche' Electron ha bisogno
; delle DLL e della cartella resources che stanno accanto all'exe.

!macro customInstall
  ; copia (ricreata ad ogni installazione/aggiornamento, quindi sempre allineata all'exe)
  Delete "$INSTDIR\${PRODUCT_FILENAME}.scr"
  CopyFiles /SILENT "$INSTDIR\${PRODUCT_FILENAME}.exe" "$INSTDIR\${PRODUCT_FILENAME}.scr"

  ; Solo alla PRIMA installazione: imposta Flip Clock come screensaver di Windows.
  ; Se poi scegli un altro screensaver, gli aggiornamenti non lo cambiano piu'.
  ReadRegStr $0 HKCU "Software\FlipClock" "ScreensaverSet"
  StrCmp $0 "" 0 scrDone
    WriteRegStr HKCU "Control Panel\Desktop" "SCRNSAVE.EXE" "$INSTDIR\${PRODUCT_FILENAME}.scr"
    WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveActive" "1"
    WriteRegStr HKCU "Software\FlipClock" "ScreensaverSet" "1"
    ; avvisa Windows che lo screensaver e' stato attivato
    System::Call 'user32::SystemParametersInfoW(i 0x0011, i 1, p 0, i 3)'
  scrDone:
!macroend
