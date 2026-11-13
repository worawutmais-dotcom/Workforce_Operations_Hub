' ===== BVN Package - Operations Console (Codex) launcher (no console window) =====
' Double-click this file to start the local server hidden and open the console.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir

' Start the isolated Codex server with NO visible window (0 = hidden), do not wait.
' 18777 intentionally avoids the legacy Admin Console's historical 8777 port.
sh.Run "cmd /c py -m http.server 18777 --bind 127.0.0.1 --directory """ & scriptDir & """", 0, False

' Give the server a moment, then open the console in the default browser.
WScript.Sleep 1000
sh.Run "http://127.0.0.1:18777/index.html", 1, False
