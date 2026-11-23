"""
Scanner local do PC Windows para detectar jogos instalados na:
  1) Steam (lê registro do Windows + libraryfolders.vdf + appmanifest_*.acf)
  2) Epic Games Store (lê C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\*.item)
  3) Xbox / PC Game Pass (lê pastas XboxGames em todos os discos + MicrosoftGame.config / AppxManifest.xml)
  4) Pastas customizadas configuradas pelo usuário

Para cada jogo encontrado, também identifica o executável (.exe) principal para o
Detector Automático de Jogatina reconhecer o jogo no instante em que você abrir!
"""

import json
import os
import re
import string
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional

try:
    import winreg
except ImportError:
    winreg = None

from .database import normalize_title

IGNORED_EXE_TOKENS = (
    "unins", "crash", "report", "redist", "vcredist", "dxsetup", "directx",
    "dotnet", "easyanticheat", "battleye", "setup", "install", "update",
    "launcher_helper", "unitycrashhandler", "ue4prereq", "ueprereq",
    "cefprocess", "webhelper", "vc_redist", "physx", "openal", "ndp",
    "config", "benchmark", "editor", "modtool", "server", "dedicated",
)

IGNORED_STEAM_APPIDS = {
    228980,  # Steamworks Common Redistributables
    1070560, 1391110, 1628350, 1493710, 1887720, 2348590, 2805730,  # Proton / Runtimes
    250820,  # SteamVR
}


def _find_best_exe(install_dir: str, game_name: str = "") -> Optional[str]:
    """Encontra o .exe principal mais provável dentro da pasta de instalação."""
    if not install_dir or not os.path.isdir(install_dir):
        return None

    candidates = []
    norm_game = normalize_title(game_name)
    game_tokens = [t for t in norm_game.split() if len(t) >= 3]

    base_depth = install_dir.rstrip("\\/").count(os.sep)
    for root, dirs, files in os.walk(install_dir):
        depth = root.rstrip("\\/").count(os.sep) - base_depth
        if depth > 3:
            dirs[:] = []
            continue
        # Ignora pastas de redist/engine comuns
        dirs[:] = [
            d for d in dirs
            if d.lower() not in ("_commonredist", "redist", "directx", "vcredist", "dotnet", "installers", "easyanticheat", "battleye", "crashreportclient")
        ]
        for f in files:
            if not f.lower().endswith(".exe"):
                continue
            fl = f.lower()
            if any(tok in fl for tok in IGNORED_EXE_TOKENS):
                continue
            full = os.path.join(root, f)
            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0
            # Heurística de pontuação: executável maior, mais próximo da raiz, nome parecido ou Shipping.exe (Unreal)
            score = 0
            if "shipping" in fl:
                score += 60
            if depth == 0:
                score += 25
            elif depth == 1:
                score += 15
            if any(tok in fl for tok in game_tokens):
                score += 45
            if size > 5_000_000:
                score += 30
            elif size > 1_000_000:
                score += 15
            candidates.append((score, size, full))

    if not candidates:
        return None
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return candidates[0][2]


def _get_steam_root() -> Optional[str]:
    if winreg is not None:
        for hive, path in [
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam"),
        ]:
            try:
                with winreg.OpenKey(hive, path) as k:
                    for val_name in ("SteamPath", "InstallPath"):
                        try:
                            val, _ = winreg.QueryValueEx(k, val_name)
                            if val and os.path.isdir(val):
                                return os.path.normpath(val)
                        except OSError:
                            continue
            except OSError:
                continue
    for fallback in (r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam", r"D:\Steam"):
        if os.path.isdir(fallback):
            return fallback
    return None


def scan_steam_installed() -> List[Dict]:
    results = []
    steam_root = _get_steam_root()
    if not steam_root:
        return results

    library_paths = {os.path.normpath(steam_root)}
    vdf_path = os.path.join(steam_root, "steamapps", "libraryfolders.vdf")
    if os.path.isfile(vdf_path):
        try:
            content = open(vdf_path, encoding="utf-8", errors="ignore").read()
            for m in re.finditer(r'"path"\s+"([^"]+)"', content):
                p = m.group(1).replace("\\\\", "\\")
                if os.path.isdir(p):
                    library_paths.add(os.path.normpath(p))
        except OSError:
            pass

    seen_appids = set()
    for lib in library_paths:
        steamapps = os.path.join(lib, "steamapps")
        if not os.path.isdir(steamapps):
            continue
        for fname in os.listdir(steamapps):
            if not (fname.startswith("appmanifest_") and fname.endswith(".acf")):
                continue
            acf_path = os.path.join(steamapps, fname)
            try:
                txt = open(acf_path, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            m_id = re.search(r'"appid"\s+"(\d+)"', txt)
            m_name = re.search(r'"name"\s+"([^"]+)"', txt)
            m_dir = re.search(r'"installdir"\s+"([^"]+)"', txt)
            if not m_id or not m_name:
                continue
            appid = int(m_id.group(1))
            if appid in IGNORED_STEAM_APPIDS or appid in seen_appids:
                continue
            title = m_name.group(1).strip()
            if any(skip in title.lower() for skip in ("proton ", "steam linux runtime", "steamworks common")):
                continue
            seen_appids.add(appid)

            install_dir = os.path.join(steamapps, "common", m_dir.group(1)) if m_dir else ""
            exe_path = _find_best_exe(install_dir, title) if install_dir else None
            results.append({
                "title": title,
                "store": "Steam",
                "platform": "PC",
                "steam_appid": appid,
                "epic_id": "",
                "xbox_id": "",
                "install_dir": install_dir,
                "exe_path": exe_path or "",
                "exe_name": os.path.basename(exe_path) if exe_path else "",
                "cover_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900_2x.jpg",
                "banner_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg",
            })
    return results


def scan_epic_installed() -> List[Dict]:
    results = []
    manifests_dir = r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
    if not os.path.isdir(manifests_dir):
        return results

    for fname in os.listdir(manifests_dir):
        if not fname.endswith(".item"):
            continue
        fpath = os.path.join(manifests_dir, fname)
        try:
            data = json.load(open(fpath, encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        title = (data.get("DisplayName") or "").strip()
        if not title:
            continue
        # Ignora DLCs / Unreal Engine
        if data.get("bIsIncompleteInstall") or title.lower().startswith("unreal engine"):
            continue
        cats = [c.get("path", "") for c in (data.get("AppCategories") or [])]
        if cats and "games" not in cats and "public" not in cats:
            continue

        install_dir = os.path.normpath(data.get("InstallLocation") or "")
        launch_rel = data.get("LaunchExecutable") or ""
        exe_path = os.path.normpath(os.path.join(install_dir, launch_rel)) if (install_dir and launch_rel) else ""
        if not exe_path or not os.path.isfile(exe_path):
            exe_path = _find_best_exe(install_dir, title) or ""

        results.append({
            "title": title,
            "store": "Epic Games",
            "platform": "PC",
            "steam_appid": None,
            "epic_id": str(data.get("AppName") or data.get("CatalogItemId") or ""),
            "xbox_id": "",
            "install_dir": install_dir,
            "exe_path": exe_path,
            "exe_name": os.path.basename(exe_path) if exe_path else "",
            "cover_url": "",
            "banner_url": "",
        })
    return results


def _parse_xbox_game_folder(game_dir: str) -> Optional[Dict]:
    """Lê MicrosoftGame.config ou AppxManifest.xml em uma pasta de jogo do PC Game Pass."""
    content_dir = os.path.join(game_dir, "Content")
    search_dirs = [content_dir, game_dir] if os.path.isdir(content_dir) else [game_dir]

    title = os.path.basename(game_dir)
    exe_rel = ""
    store_id = ""

    for d in search_dirs:
        mgc = os.path.join(d, "MicrosoftGame.config")
        if os.path.isfile(mgc):
            try:
                tree = ET.parse(mgc)
                root = tree.getroot()
                shell = root.find(".//ShellVisuals")
                if shell is not None and shell.attrib.get("DefaultDisplayName"):
                    cand = shell.attrib["DefaultDisplayName"].strip()
                    if not cand.startswith("ms-resource:"):
                        title = cand
                exe_el = root.find(".//Executable")
                if exe_el is not None and exe_el.attrib.get("Name"):
                    exe_rel = exe_el.attrib["Name"].strip()
                sid = root.find(".//StoreId")
                if sid is not None and sid.text:
                    store_id = sid.text.strip()
                break
            except Exception:
                pass

        appx = os.path.join(d, "AppxManifest.xml")
        if os.path.isfile(appx):
            try:
                txt = open(appx, encoding="utf-8", errors="ignore").read()
                m_dn = re.search(r"<DisplayName>([^<]+)</DisplayName>", txt)
                if m_dn and not m_dn.group(1).strip().startswith("ms-resource:"):
                    title = m_dn.group(1).strip()
                m_ex = re.search(r'Executable="([^"]+\.exe)"', txt, re.I)
                if m_ex:
                    exe_rel = m_ex.group(1).strip()
                break
            except Exception:
                pass

    base_for_exe = content_dir if os.path.isdir(content_dir) else game_dir
    exe_path = os.path.normpath(os.path.join(base_for_exe, exe_rel)) if exe_rel else ""
    if not exe_path or not os.path.isfile(exe_path):
        exe_path = _find_best_exe(game_dir, title) or ""

    if not exe_path and not store_id:
        return None

    return {
        "title": title,
        "store": "PC Game Pass",
        "platform": "PC",
        "steam_appid": None,
        "epic_id": "",
        "xbox_id": store_id,
        "install_dir": game_dir,
        "exe_path": exe_path,
        "exe_name": os.path.basename(exe_path) if exe_path else "",
        "cover_url": "",
        "banner_url": "",
    }


def scan_xbox_gamepass_installed() -> List[Dict]:
    results = []
    seen_dirs = set()
    # Varre C:\XboxGames, D:\XboxGames, E:\XboxGames ...
    for letter in string.ascii_uppercase:
        root_dir = f"{letter}:\\XboxGames"
        if not os.path.isdir(root_dir):
            continue
        try:
            entries = os.listdir(root_dir)
        except OSError:
            continue
        for entry in entries:
            gdir = os.path.join(root_dir, entry)
            if not os.path.isdir(gdir) or gdir.lower() in seen_dirs:
                continue
            seen_dirs.add(gdir.lower())
            parsed = _parse_xbox_game_folder(gdir)
            if parsed:
                results.append(parsed)
    return results


def scan_all_installed_games(extra_dirs: Optional[List[str]] = None) -> List[Dict]:
    """Escaneia Steam + Epic Games + PC Game Pass + pastas extras configuradas."""
    found = []
    found.extend(scan_steam_installed())
    found.extend(scan_epic_installed())
    found.extend(scan_xbox_gamepass_installed())

    for d in (extra_dirs or []):
        d = d.strip()
        if not d or not os.path.isdir(d):
            continue
        try:
            for entry in os.listdir(d):
                sub = os.path.join(d, entry)
                if not os.path.isdir(sub):
                    continue
                exe = _find_best_exe(sub, entry)
                if exe:
                    found.append({
                        "title": entry,
                        "store": "Outro",
                        "platform": "PC",
                        "steam_appid": None,
                        "epic_id": "",
                        "xbox_id": "",
                        "install_dir": sub,
                        "exe_path": exe,
                        "exe_name": os.path.basename(exe),
                        "cover_url": "",
                        "banner_url": "",
                    })
        except OSError:
            pass

    # Remove duplicatas pelo norm_title + store
    dedup = {}
    for item in found:
        key = (normalize_title(item["title"]), item["store"])
        if key not in dedup:
            dedup[key] = item
    return sorted(dedup.values(), key=lambda x: (x["store"], x["title"].lower()))
