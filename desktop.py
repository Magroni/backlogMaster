"""
🎮 Game Backlog Master — Aplicativo Desktop Nativo para Windows
================================================================
- Janela própria nativa (Edge WebView2 via pywebview) — sem aba de navegador,
  sem janela de terminal, sem scripts .bat/.vbs!
- Ícone na Bandeja do Sistema (System Tray): fechar no 'X' minimiza para a
  bandeja mantendo o Detector Automático de Jogos PC rodando 24/7.
- Instância única: se você abrir o .exe novamente, ele apenas restaura a
  janela já aberta.
- Suporta iniciar automaticamente minimizado com o Windows (--minimized).
"""

import ctypes
import os
import socket
import sys
import threading
import time
import traceback
import urllib.request

# Em modo --windowed (PyInstaller), sys.stdout/sys.stderr podem ser None -> evita crash no uvicorn/logging!
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

# Garante que imports do pacote `app` funcionem tanto em dev quanto no .exe PyInstaller
if getattr(sys, "frozen", False):
    os.chdir(os.path.dirname(sys.executable))
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pystray
import uvicorn
import webview
from PIL import Image

from app.database import DATA_DIR, get_resource_path, init_db
from app.main import app as fastapi_app
from app.system_win import (
    acquire_single_instance_mutex,
    is_windows_startup_enabled,
    register_window_show_callback,
    set_windows_startup,
)
from app.watcher import watcher

PORT_FILE = os.path.join(DATA_DIR, "runtime.port")
PREFERRED_PORT = 8765


def find_free_port(preferred: int = PREFERRED_PORT) -> int:
    for port in (preferred, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
            except OSError:
                continue
    return 8765


def wake_existing_instance() -> bool:
    """Se já existe um GameBacklogMaster.exe rodando na bandeja, pede para restaurar a janela."""
    ports = [PREFERRED_PORT]
    if os.path.isfile(PORT_FILE):
        try:
            p = int(open(PORT_FILE, encoding="utf-8").read().strip())
            if p not in ports:
                ports.insert(0, p)
        except Exception:
            pass
    for p in ports:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{p}/api/system/show-window", method="POST", data=b"{}")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            continue
    return False


def load_tray_icon() -> Image.Image:
    for rel in (os.path.join("assets", "icon.png"), os.path.join("assets", "icon.ico")):
        path = get_resource_path(rel)
        if os.path.isfile(path):
            return Image.open(path)
    # Fallback geométrico mínimo
    img = Image.new("RGBA", (64, 64), (99, 102, 241, 255))
    return img


class DesktopApp:
    def __init__(self, port: int, start_minimized: bool = False):
        self.port = port
        self.url = f"http://127.0.0.1:{port}"
        self.start_minimized = start_minimized
        self.window = None
        self.tray = None
        self.server = None
        self.quitting = False

    def start_backend(self):
        config = uvicorn.Config(
            fastapi_app,
            host="127.0.0.1",
            port=self.port,
            log_level="warning",
            log_config=None,
            access_log=False,
        )
        self.server = uvicorn.Server(config)
        # Evita tentar registrar signal handlers fora da main thread
        self.server.install_signal_handlers = lambda: None
        t = threading.Thread(target=self.server.run, daemon=True)
        t.start()

        # Aguarda o servidor subir (geralmente < 300ms)
        for _ in range(80):
            try:
                with urllib.request.urlopen(f"{self.url}/api/tracker/live", timeout=0.5) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.1)

        try:
            with open(PORT_FILE, "w", encoding="utf-8") as f:
                f.write(str(self.port))
        except OSError:
            pass

    def show_window(self, *_args):
        if self.window:
            try:
                self.window.show()
                self.window.restore()
            except Exception:
                pass

    def on_closing(self):
        # Ao clicar no 'X', esconde para a bandeja do sistema em vez de matar o Detector PC!
        if self.quitting:
            return True
        if self.window:
            self.window.hide()
        return False

    def toggle_startup(self, icon, item):
        new_state = not is_windows_startup_enabled()
        set_windows_startup(new_state)
        icon.update_menu()

    def quit_app(self, *_args):
        self.quitting = True
        try:
            if watcher.active_session:
                watcher._finalize_session("app_exit")
        except Exception:
            pass
        if self.tray:
            try:
                self.tray.stop()
            except Exception:
                pass
        if self.server:
            self.server.should_exit = True
        if self.window:
            try:
                self.window.destroy()
            except Exception:
                pass
        try:
            if os.path.isfile(PORT_FILE):
                os.remove(PORT_FILE)
        except OSError:
            pass
        os._exit(0)

    def _tray_status_label(self, _item):
        live = watcher.get_live_status()
        if live.get("active"):
            a = live["active"]
            mins = int(a["elapsed_seconds"] // 60)
            return f"🟢 Jogando: {a['title']} ({mins}m)"
        return "📡 Detector PC: Monitorando" if live.get("enabled") else "⏸️ Detector PC: Pausado"

    def _tray_tooltip_updater(self):
        while not self.quitting:
            try:
                if self.tray:
                    live = watcher.get_live_status()
                    if live.get("active"):
                        self.tray.title = f"🎮 Jogando: {live['active']['title']}"
                    else:
                        self.tray.title = "🎮 Game Backlog Master (Monitorando PC)"
            except Exception:
                pass
            time.sleep(5)

    def start_tray(self):
        menu = pystray.Menu(
            pystray.MenuItem("🎮 Abrir Backlog Master", self.show_window, default=True),
            pystray.MenuItem(self._tray_status_label, None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Iniciar com o Windows",
                self.toggle_startup,
                checked=lambda _item: is_windows_startup_enabled(),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("❌ Sair (Encerrar Tracker)", self.quit_app),
        )
        self.tray = pystray.Icon("GameBacklogMaster", load_tray_icon(), "🎮 Game Backlog Master", menu)
        threading.Thread(target=self.tray.run, daemon=True).start()
        threading.Thread(target=self._tray_tooltip_updater, daemon=True).start()

    def run(self):
        init_db()
        self.start_backend()
        register_window_show_callback(self.show_window)
        self.start_tray()

        self.window = webview.create_window(
            "🎮 Game Backlog Master — PC Tracker",
            self.url,
            width=1360,
            height=860,
            min_size=(1024, 680),
            background_color="#090D16",
            hidden=self.start_minimized,
        )
        self.window.events.closing += self.on_closing
        webview.start(gui="edgechromium", debug=False)


def main():
    try:
        start_minimized = "--minimized" in sys.argv
        if not acquire_single_instance_mutex():
            wake_existing_instance()
            sys.exit(0)

        port = find_free_port(PREFERRED_PORT)
        desktop = DesktopApp(port=port, start_minimized=start_minimized)
        desktop.run()
    except Exception:
        os.makedirs(DATA_DIR, exist_ok=True)
        log_path = os.path.join(DATA_DIR, "crash.log")
        err = traceback.format_exc()
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(err)
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                f"Erro ao iniciar Game Backlog Master.\nLog salvo em: {log_path}\n\n{err[:600]}",
                "Game Backlog Master - Erro",
                0x10,
            )
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
