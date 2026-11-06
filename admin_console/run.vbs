' ===== BVN Package - Admin Console launcher (no console window) =====
' Double-click this file to start the local server hidden and open the console.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir

' Start the local web server with NO visible window (0 = hidden), do not wait.
sh.Run "cmd /c py -m http.server 8777 --bind 127.0.0.1", 0, False

' Give the server a moment, then open the console in the default browser.
WScript.Sleep 1000
sh.Run "http://127.0.0.1:8777/index.html", 1, False
