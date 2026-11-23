Set WshShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir
WshShell.Run """" & strDir & "\.venv\Scripts\pythonw.exe"" -m uvicorn app.main:app --host 127.0.0.1 --port 8765", 0, False
WScript.Sleep 1800
WshShell.Run "http://127.0.0.1:8765", 1, False
