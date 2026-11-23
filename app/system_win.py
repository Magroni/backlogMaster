"""
Integrações nativas do Windows:
  - Iniciar com o Windows (Registro HKCU\\...\\Run — não exige admin!)
  - Abrir pasta persistente de dados no Explorer
  - Instância única (se abrir o .exe duas vezes, restaura a janela existente!)
"""

import ctypes
import os
import sys
from typing import Callable, Optional

try:
    import winreg
except ImportError:
    winreg = None

from .database import DATA_DIR

RUN_REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_REG_NAME = "GameBacklogMaster"
MUTEX_NAME = "Local\\GameBacklogMaster_SingleInstance_Mutex"

_window_show_callback: Optional[Callable[[], None]] = None
_mutex_handle = None


def register_window_show_callback(cb: Callable[[], None]):
    global _window_show_callback
    _window_show_callback = cb


def trigger_show_window() -> bool:
    if _window_show_callback:
        try:
            _window_show_callback()
            return True
        except Exception:
            return False
    return False


def get_startup_command() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --minimized'
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    exe = pythonw if os.path.isfile(pythonw) else sys.executable
    script = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "desktop.py"))
    return f'"{exe}" "{script}" --minimized'


def is_windows_startup_enabled() -> bool:
    if winreg is None:
        return False
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_REG_PATH, 0, winreg.KEY_READ) as key:
            val, _ = winreg.QueryValueEx(key, APP_REG_NAME)
            return bool(val)
    except OSError:
        return False


def set_windows_startup(enabled: bool) -> bool:
    if winreg is None:
        return False
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_REG_PATH, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                winreg.SetValueEx(key, APP_REG_NAME, 0, winreg.REG_SZ, get_startup_command())
            else:
                try:
                    winreg.DeleteValue(key, APP_REG_NAME)
                except FileNotFoundError:
                    pass
        return True
    except OSError:
        return False


def open_data_folder():
    os.makedirs(DATA_DIR, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(DATA_DIR)


def acquire_single_instance_mutex() -> bool:
    """Retorna True se esta for a primeira instância; False se já existe outra rodando."""
    global _mutex_handle
    if sys.platform != "win32":
        return True
    try:
        kernel32 = ctypes.windll.kernel32
        _mutex_handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        last_err = kernel32.GetLastError()
        ERROR_ALREADY_EXISTS = 183
        return last_err != ERROR_ALREADY_EXISTS
    except Exception:
        return True
