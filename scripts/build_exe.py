"""Compila o GameBacklogMaster.exe standalone (Windows, sem terminal, com WebView2 + System Tray)."""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

py = sys.executable

# 1. Garante que o ícone existe
subprocess.check_call([py, os.path.join("scripts", "make_icon.py")])

# 2. Compila com PyInstaller (--onefile --windowed)
cmd = [
    py, "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--windowed",
    "--name", "GameBacklogMaster",
    "--icon", os.path.join("assets", "icon.ico"),
    "--add-data", f"{os.path.join('app', 'static')};app/static",
    "--add-data", "assets;assets",
    "--collect-data", "fake_useragent",
    "--collect-all", "webview",
    "--collect-all", "pythonnet",
    "--collect-all", "clr_loader",
    "--collect-all", "pystray",
    "--collect-submodules", "uvicorn",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan.on",
    "--hidden-import", "howlongtobeatpy",
    "--hidden-import", "psutil",
    "--hidden-import", "clr",
    "desktop.py",
]

print("Running PyInstaller:", " ".join(cmd))
subprocess.check_call(cmd)
print("\nBUILD CONCLUÍDO! Executável em:", os.path.join(ROOT, "dist", "GameBacklogMaster.exe"))
