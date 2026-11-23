"""
Detector Automático em Tempo Real de Jogos Rodando no PC (Windows).

Como funciona:
  - Roda em segundo plano a cada 3 segundos via psutil (<0.2% CPU).
  - Detecta o jogo comparando processos ativos contra:
      1) exe_path exato ou exe_name dos jogos na sua biblioteca SQLite
      2) Qualquer executável rodando dentro da pasta install_dir do jogo
         (pega sub-binários Unreal/Unity/Launchers automaticamente!)
      3) Catálogo de jogos instalados escaneado de Steam, Epic e XboxGames
         (mesmo antes de importar — e opcionalmente adiciona sozinho ao Backlog!)
  - Quando detecta início:
      * Atualiza o banner ao vivo "🟢 JOGANDO AGORA" com cronômetro em tempo real
      * Muda status Backlog/Pausado -> Jogando e preenche start_date
  - Quando você fecha o jogo:
      * Salva a sessão automaticamente na tabela `sessions` (auto_detected=1)
      * Soma as horas exatas em `games.hours_played` e atualiza `last_played_at`
"""

import asyncio
import ctypes
import os
import subprocess
import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import psutil

from .database import get_db, get_settings, normalize_title
from .scanner import IGNORED_EXE_TOKENS, scan_all_installed_games

SYSTEM_IGNORED_EXES = {
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
    "lsass.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "explorer.exe",
    "searchhost.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe",
    "taskhostw.exe", "runtimebroker.exe", "sihost.exe", "ctfmon.exe", "conhost.exe",
    "cmd.exe", "powershell.exe", "pwsh.exe", "windowsterminal.exe", "python.exe",
    "pythonw.exe", "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe",
    "discord.exe", "spotify.exe", "code.exe", "antigravity.exe", "steam.exe",
    "steamwebhelper.exe", "steamservice.exe", "epicgameslauncher.exe",
    "epicwebhelper.exe", "xboxpcapp.exe", "gamingservices.exe", "gamingservicesnet.exe",
    "gamebar.exe", "gamebarftserver.exe", "nvidia overlay.exe", "nvcontainer.exe",
    "msmpeng.exe", "audiodg.exe", "spoolsv.exe", "dllhost.exe", "backgroundtaskhost.exe",
    "applicationframehost.exe", "textinputhost.exe", "widgetservice.exe", "widgets.exe",
    "onedrive.exe", "teams.exe", "slack.exe", "whatsapp.exe", "telegram.exe",
}


def get_foreground_window_title() -> str:
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except Exception:
        return ""


class GameProcessWatcher:
    def __init__(self):
        self.active_session: Optional[Dict[str, Any]] = None
        self.last_completed: Optional[Dict[str, Any]] = None
        self.installed_cache: List[Dict[str, Any]] = []
        self.last_scan_ts: float = 0.0
        self.running: bool = False
        self._task: Optional[asyncio.Task] = None

    def refresh_installed_cache(self, force: bool = False):
        now = time.time()
        if not force and (now - self.last_scan_ts) < 300 and self.installed_cache:
            return self.installed_cache
        cfg = get_settings()
        extra = [x.strip() for x in (cfg.get("custom_scan_dirs") or "").split(";") if x.strip()]
        self.installed_cache = scan_all_installed_games(extra_dirs=extra)
        self.last_scan_ts = now
        return self.installed_cache

    def _load_db_matchers(self) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, title, norm_title, store, status, cover_url, banner_url, "
                "exe_name, exe_path, install_dir, steam_appid FROM games"
            ).fetchall()
        return [dict(r) for r in rows]

    def _scan_running_processes(self) -> List[Dict[str, Any]]:
        procs = []
        for p in psutil.process_iter(["pid", "name", "exe", "create_time"]):
            try:
                info = p.info
                name = (info.get("name") or "").strip()
                nl = name.lower()
                if not nl or nl in SYSTEM_IGNORED_EXES:
                    continue
                if any(tok in nl for tok in IGNORED_EXE_TOKENS):
                    continue
                exe = info.get("exe") or ""
                el = exe.lower()
                if el.startswith(r"c:\windows\\") or r"\windows\system32\\" in el:
                    continue
                procs.append({
                    "pid": info["pid"],
                    "name": name,
                    "name_lower": nl,
                    "exe": exe,
                    "exe_lower": el,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        return procs

    def detect_running_game(self) -> Optional[Dict[str, Any]]:
        procs = self._scan_running_processes()
        if not procs:
            return None

        db_games = self._load_db_matchers()

        # 1) Match exato por exe_path, install_dir ou exe_name contra jogos do SQLite
        for g in db_games:
            g_exe_path = (g.get("exe_path") or "").strip().lower()
            g_exe_name = (g.get("exe_name") or "").strip().lower()
            g_dir = (g.get("install_dir") or "").strip().lower().rstrip("\\/")

            for p in procs:
                if g_exe_path and p["exe_lower"] and p["exe_lower"] == g_exe_path:
                    return {"source": "db", "game": g, "proc": p}
                if g_dir and p["exe_lower"] and p["exe_lower"].startswith(g_dir + "\\"):
                    return {"source": "db", "game": g, "proc": p}
                if g_exe_name and p["name_lower"] == g_exe_name:
                    return {"source": "db", "game": g, "proc": p}

        # 2) Match contra jogos instalados escaneados (Steam, Epic, XboxGames) ainda não no DB
        installed = self.refresh_installed_cache(force=False)
        for inst in installed:
            i_exe_path = (inst.get("exe_path") or "").strip().lower()
            i_exe_name = (inst.get("exe_name") or "").strip().lower()
            i_dir = (inst.get("install_dir") or "").strip().lower().rstrip("\\/")

            for p in procs:
                matched = False
                if i_exe_path and p["exe_lower"] == i_exe_path:
                    matched = True
                elif i_dir and p["exe_lower"].startswith(i_dir + "\\"):
                    matched = True
                elif i_exe_name and p["name_lower"] == i_exe_name:
                    matched = True
                if matched:
                    return {"source": "installed", "installed": inst, "proc": p}

        return None

    def _ensure_game_in_db(self, inst: Dict[str, Any], proc: Dict[str, Any]) -> Dict[str, Any]:
        norm = normalize_title(inst["title"])
        today_str = date.today().isoformat()
        with get_db() as conn:
            row = None
            if inst.get("steam_appid"):
                row = conn.execute("SELECT * FROM games WHERE steam_appid=?", (inst["steam_appid"],)).fetchone()
            if not row:
                row = conn.execute("SELECT * FROM games WHERE norm_title=?", (norm,)).fetchone()
            if row:
                # Atualiza exe_path / install_dir se vazios
                conn.execute(
                    "UPDATE games SET installed=1, exe_name=COALESCE(NULLIF(exe_name,''),?), "
                    "exe_path=COALESCE(NULLIF(exe_path,''),?), install_dir=COALESCE(NULLIF(install_dir,''),?), "
                    "updated_at=datetime('now','localtime') WHERE id=?",
                    (proc["name"], proc["exe"] or inst.get("exe_path", ""), inst.get("install_dir", ""), row["id"]),
                )
                return dict(conn.execute("SELECT * FROM games WHERE id=?", (row["id"],)).fetchone())

            cur = conn.execute(
                """
                INSERT INTO games(
                    title, norm_title, status, priority, platform, store,
                    steam_appid, epic_id, xbox_id, cover_url, banner_url,
                    exe_name, exe_path, install_dir, installed, purchase_date, start_date
                ) VALUES (?, ?, 'Jogando', 2, 'PC', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    inst["title"], norm, inst.get("store", "Steam"),
                    inst.get("steam_appid"), inst.get("epic_id", ""), inst.get("xbox_id", ""),
                    inst.get("cover_url", ""), inst.get("banner_url", ""),
                    proc["name"], proc["exe"] or inst.get("exe_path", ""),
                    inst.get("install_dir", ""), today_str, today_str,
                ),
            )
            return dict(conn.execute("SELECT * FROM games WHERE id=?", (cur.lastrowid,)).fetchone())

    def _start_session(self, game: Dict[str, Any], proc: Dict[str, Any]):
        now_iso = datetime.now().isoformat(timespec="seconds")
        today_str = date.today().isoformat()

        # Se estava Backlog ou Pausado -> muda automaticamente para Jogando!
        if game.get("id"):
            with get_db() as conn:
                if game.get("status") in ("Backlog", "Pausado"):
                    conn.execute(
                        "UPDATE games SET status='Jogando', start_date=COALESCE(NULLIF(start_date,''),?), "
                        "last_played_at=?, updated_at=datetime('now','localtime') WHERE id=?",
                        (today_str, now_iso, game["id"]),
                    )
                else:
                    conn.execute(
                        "UPDATE games SET last_played_at=?, updated_at=datetime('now','localtime') WHERE id=?",
                        (now_iso, game["id"]),
                    )

        self.active_session = {
            "game_id": game.get("id"),
            "title": game["title"],
            "store": game.get("store", "PC"),
            "cover_url": game.get("cover_url") or game.get("banner_url") or "",
            "pid": proc["pid"],
            "exe_name": proc["name"],
            "exe_path": proc["exe"],
            "started_ts": time.time(),
            "started_at": now_iso,
            "last_seen_ts": time.time(),
            "persisted_minutes": 0.0,
        }

    def _finalize_session(self, reason: str = "closed"):
        sess = self.active_session
        if not sess:
            return
        self.active_session = None

        cfg = get_settings()
        min_sec = int(cfg.get("auto_track_min_seconds") or 60)
        elapsed_sec = max(0.0, time.time() - sess["started_ts"])
        if elapsed_sec < min_sec:
            return

        total_minutes = round(elapsed_sec / 60.0, 1)
        added_hours = round(elapsed_sec / 3600.0, 2)
        ended_iso = datetime.now().isoformat(timespec="seconds")

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO sessions(
                    game_id, game_title, store, started_at, ended_at,
                    duration_minutes, auto_detected, notes
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    sess["game_id"],
                    sess["title"],
                    sess["store"],
                    sess["started_at"],
                    ended_iso,
                    total_minutes,
                    f"Sessão detectada automaticamente ({sess['exe_name']})",
                ),
            )
            if sess["game_id"]:
                conn.execute(
                    "UPDATE games SET hours_played=ROUND(hours_played + ?, 2), "
                    "last_played_at=?, updated_at=datetime('now','localtime') WHERE id=?",
                    (added_hours, ended_iso, sess["game_id"]),
                )

        self.last_completed = {
            "game_id": sess["game_id"],
            "title": sess["title"],
            "duration_minutes": total_minutes,
            "ended_at": ended_iso,
            "reason": reason,
        }

    def poll_once(self):
        cfg = get_settings()
        if cfg.get("auto_track_enabled", "1") != "1":
            if self.active_session:
                self._finalize_session("disabled")
            return

        hit = self.detect_running_game()
        if hit:
            if hit["source"] == "installed":
                if cfg.get("auto_add_detected", "1") == "1":
                    game = self._ensure_game_in_db(hit["installed"], hit["proc"])
                else:
                    inst = hit["installed"]
                    game = {
                        "id": None,
                        "title": inst["title"],
                        "store": inst["store"],
                        "cover_url": inst.get("cover_url", ""),
                    }
            else:
                game = hit["game"]

            proc = hit["proc"]
            if self.active_session:
                # Mesmo jogo ainda aberto?
                same_id = self.active_session.get("game_id") and self.active_session.get("game_id") == game.get("id")
                same_title = normalize_title(self.active_session["title"]) == normalize_title(game["title"])
                if same_id or same_title:
                    self.active_session["last_seen_ts"] = time.time()
                    self.active_session["pid"] = proc["pid"]
                    return
                # Mudou para outro jogo
                self._finalize_session("switched")
            self._start_session(game, proc)
        else:
            if self.active_session:
                # Grace period de 10s (para launchers que reiniciam o executável do jogo)
                if (time.time() - self.active_session["last_seen_ts"]) >= 10:
                    self._finalize_session("closed")

    def get_live_status(self) -> Dict[str, Any]:
        cfg = get_settings()
        enabled = cfg.get("auto_track_enabled", "1") == "1"
        active = None
        if self.active_session:
            elapsed = int(max(0, time.time() - self.active_session["started_ts"]))
            active = {
                "game_id": self.active_session["game_id"],
                "title": self.active_session["title"],
                "store": self.active_session["store"],
                "cover_url": self.active_session["cover_url"],
                "exe_name": self.active_session["exe_name"],
                "started_at": self.active_session["started_at"],
                "elapsed_seconds": elapsed,
            }
        return {
            "enabled": enabled,
            "active": active,
            "last_completed": self.last_completed,
            "foreground_window": get_foreground_window_title(),
            "installed_known_count": len(self.installed_cache),
        }

    def list_bindable_processes(self) -> List[Dict[str, Any]]:
        """Lista processos do usuário rodando agora para vincular manualmente a um jogo em 1 clique."""
        seen = set()
        out = []
        for p in self._scan_running_processes():
            if p["name_lower"] in seen:
                continue
            seen.add(p["name_lower"])
            out.append({
                "pid": p["pid"],
                "exe_name": p["name"],
                "exe_path": p["exe"],
                "install_dir": os.path.dirname(p["exe"]) if p["exe"] else "",
            })
        return sorted(out, key=lambda x: x["exe_name"].lower())

    async def _loop(self):
        self.running = True
        try:
            await asyncio.to_thread(self.refresh_installed_cache, True)
        except Exception:
            pass
        while self.running:
            try:
                await asyncio.to_thread(self.poll_once)
            except Exception:
                pass
            await asyncio.sleep(3)

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False
        if self.active_session:
            self._finalize_session("shutdown")
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


def launch_game_on_pc(game: Dict[str, Any]) -> Dict[str, Any]:
    """Abre o jogo diretamente pelo Steam URI ou executável local."""
    appid = game.get("steam_appid")
    exe_path = game.get("exe_path") or ""
    if game.get("store") == "Steam" and appid:
        os.startfile(f"steam://rungameid/{appid}")
        return {"ok": True, "method": "steam_uri"}
    if exe_path and os.path.isfile(exe_path):
        subprocess.Popen([exe_path], cwd=os.path.dirname(exe_path), close_fds=True)
        return {"ok": True, "method": "exe"}
    if appid:
        os.startfile(f"steam://rungameid/{appid}")
        return {"ok": True, "method": "steam_uri"}
    return {"ok": False, "error": "Nenhum executável ou Steam AppID vinculado a este jogo."}


watcher = GameProcessWatcher()
