import json
import math
import os
import re
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "backlog_master.db")


DEFAULT_SETTINGS: Dict[str, str] = {
    "meta_anual": "20",
    "horas_semana": "12",
    "ano_ref": str(date.today().year),
    "country": "BR",
    "currency": "BRL",
    "usd_to_brl": "5.80",
    "hltb_mode": "extra",  # extra | main | comp
    "w_priority": "0.40",
    "w_critic": "0.30",
    "w_hltb": "0.20",
    "w_age": "0.10",
    "steam_api_key": "",
    "steam_id": "",
    "rawg_api_key": "",
    "igdb_client_id": "",
    "igdb_client_secret": "",
    "itad_api_key": "",
    "include_f2p": "1",
    "auto_track_enabled": "1",
    "auto_track_min_seconds": "60",
    "auto_add_detected": "1",
    "gamepass_monthly_price": "35.99",
    "prime_monthly_price": "19.90",
    "custom_scan_dirs": "",
}


def normalize_title(text: str) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFD", str(text).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[™®©:'\".,!?()\-–—_/\\]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                norm_title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Backlog',
                priority INTEGER NOT NULL DEFAULT 3,
                platform TEXT NOT NULL DEFAULT 'PC',
                store TEXT NOT NULL DEFAULT 'Steam',
                genre TEXT DEFAULT '',
                release_year INTEGER,
                hltb_main REAL,
                hltb_extra REAL,
                hltb_comp REAL,
                hltb_url TEXT DEFAULT '',
                hours_played REAL NOT NULL DEFAULT 0,
                achievements_pct REAL,
                critic_score INTEGER,
                my_rating REAL,
                price_paid REAL NOT NULL DEFAULT 0,
                protondb_tier TEXT DEFAULT '',
                steam_appid INTEGER,
                epic_id TEXT DEFAULT '',
                xbox_id TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                banner_url TEXT DEFAULT '',
                exe_name TEXT DEFAULT '',
                exe_path TEXT DEFAULT '',
                install_dir TEXT DEFAULT '',
                installed INTEGER NOT NULL DEFAULT 0,
                purchase_date TEXT DEFAULT '',
                start_date TEXT DEFAULT '',
                finish_date TEXT DEFAULT '',
                last_played_at TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE INDEX IF NOT EXISTS idx_games_norm ON games(norm_title);
            CREATE INDEX IF NOT EXISTS idx_games_appid ON games(steam_appid);
            CREATE INDEX IF NOT EXISTS idx_games_exe ON games(exe_name);

            CREATE TABLE IF NOT EXISTS wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                norm_title TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'PC',
                hype TEXT NOT NULL DEFAULT 'Quero Muito',
                release_date TEXT DEFAULT '',
                hltb_est REAL,
                critic_score INTEGER,
                full_price REAL,
                current_price REAL,
                discount_pct REAL DEFAULT 0,
                historical_low REAL,
                target_price REAL,
                best_store TEXT DEFAULT '',
                gamepass_status TEXT DEFAULT 'Não',
                steam_appid INTEGER,
                deal_url TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                updated_at TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
                game_title TEXT NOT NULL,
                store TEXT DEFAULT '',
                started_at TEXT NOT NULL,
                ended_at TEXT DEFAULT '',
                duration_minutes REAL NOT NULL DEFAULT 0,
                fun_rating INTEGER,
                beat_status TEXT DEFAULT 'Não',
                auto_detected INTEGER NOT NULL DEFAULT 0,
                notes TEXT DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_game ON sessions(game_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

            CREATE TABLE IF NOT EXISTS api_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                expires_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS epic_freebies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                start_date TEXT DEFAULT '',
                end_date TEXT DEFAULT '',
                original_price TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                store_url TEXT DEFAULT '',
                description TEXT DEFAULT '',
                claimed INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS gamepass_leaving (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT UNIQUE,
                title TEXT NOT NULL,
                norm_title TEXT NOT NULL,
                publisher TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                store_url TEXT DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))


def get_settings() -> Dict[str, str]:
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    cfg = dict(DEFAULT_SETTINGS)
    for r in rows:
        cfg[r["key"]] = r["value"]
    return cfg


def save_settings(updates: Dict[str, Any]) -> Dict[str, str]:
    with get_db() as conn:
        for k, v in updates.items():
            conn.execute(
                "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(k), "" if v is None else str(v)),
            )
    return get_settings()


def cache_get(key: str) -> Optional[Any]:
    now = datetime.now().timestamp()
    with get_db() as conn:
        row = conn.execute("SELECT payload, expires_at FROM api_cache WHERE cache_key=?", (key,)).fetchone()
        if not row:
            return None
        if row["expires_at"] < now:
            conn.execute("DELETE FROM api_cache WHERE cache_key=?", (key,))
            return None
        try:
            return json.loads(row["payload"])
        except Exception:
            return None


def cache_set(key: str, data: Any, ttl_seconds: int = 21600):
    exp = datetime.now().timestamp() + ttl_seconds
    with get_db() as conn:
        conn.execute(
            "INSERT INTO api_cache(cache_key, payload, expires_at) VALUES (?, ?, ?) "
            "ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at",
            (key, json.dumps(data, ensure_ascii=False), exp),
        )


def compute_game_metrics(g: Dict[str, Any], cfg: Dict[str, str]) -> Dict[str, Any]:
    out = dict(g)
    mode = cfg.get("hltb_mode", "extra")
    hm = float(out.get("hltb_main") or 0)
    he = float(out.get("hltb_extra") or 0)
    hc = float(out.get("hltb_comp") or 0)
    played = float(out.get("hours_played") or 0)

    if mode == "main":
        target_h = hm or he or hc
    elif mode == "comp":
        target_h = hc or he or hm
    else:
        target_h = he or hm or hc

    status = out.get("status") or "Backlog"
    if status in ("Zerado", "100% / Platina", "Dropado", "Contínuo / MP"):
        remaining = 0.0
    else:
        remaining = round(max(0.0, target_h - played), 1) if target_h > 0 else 0.0

    if status in ("Zerado", "100% / Platina"):
        progress = 100.0
    elif status == "Dropado":
        progress = 0.0
    elif target_h > 0:
        progress = round(min(99.0, (played / target_h) * 100.0), 1)
    else:
        progress = 0.0

    price = float(out.get("price_paid") or 0)
    if price <= 0:
        cost_per_hour = 0.0
    elif played > 0:
        cost_per_hour = round(price / played, 2)
    elif target_h > 0:
        cost_per_hour = round(price / target_h, 2)
    else:
        cost_per_hour = None

    # Smart Next Game Score (only for Backlog / Pausado)
    score = None
    if status in ("Backlog", "Pausado"):
        wp = float(cfg.get("w_priority") or 0.4)
        wc = float(cfg.get("w_critic") or 0.3)
        wh = float(cfg.get("w_hltb") or 0.2)
        wa = float(cfg.get("w_age") or 0.1)

        prio_map = {1: 100, 2: 80, 3: 55, 4: 30, 5: 15}
        p_val = prio_map.get(int(out.get("priority") or 3), 55)
        c_val = float(out.get("critic_score") or 75)
        h_ref = he or hm or 20
        h_val = max(15.0, min(100.0, 100.0 - h_ref * 0.9))

        age_val = 50.0
        pd = out.get("purchase_date") or ""
        if pd:
            try:
                days = (date.today() - date.fromisoformat(pd[:10])).days
                age_val = min(100.0, max(10.0, days / 3.65))
            except Exception:
                pass
        score = round(wp * p_val + wc * c_val + wh * h_val + wa * age_val, 1)

    out["target_hltb"] = round(target_h, 1) if target_h else None
    out["remaining_hours"] = remaining
    out["progress_pct"] = progress
    out["cost_per_hour"] = cost_per_hour
    out["next_score"] = score
    return out


def compute_wishlist_metrics(w: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(w)
    fp = float(out.get("full_price") or 0)
    cp = out.get("current_price")
    lp = out.get("historical_low")
    tp = out.get("target_price")
    gp = str(out.get("gamepass_status") or "Não")

    disc = 0.0
    if fp > 0 and cp is not None:
        disc = round(max(0.0, ((fp - float(cp)) / fp) * 100.0), 1)
    out["discount_pct"] = disc

    if "No PC Game Pass" in gp:
        signal = "JÁ NO GAME PASS"
    elif "Saindo" in gp:
        signal = "SAINDO DO GAME PASS"
    elif cp is not None and tp is not None and float(cp) <= float(tp):
        signal = "COMPRAR AGORA"
    elif cp is not None and lp is not None and float(lp) > 0 and float(cp) <= float(lp) * 1.05:
        signal = "MENOR HISTÓRICO"
    elif disc >= 50:
        signal = "ÓTIMA PROMO"
    else:
        signal = "AGUARDAR"

    hltb = float(out.get("hltb_est") or 0)
    out["signal"] = signal
    out["cost_per_hour"] = round(float(cp) / hltb, 2) if (cp is not None and hltb > 0) else None
    return out


def get_dashboard_summary() -> Dict[str, Any]:
    cfg = get_settings()
    ano_ref = int(cfg.get("ano_ref") or date.today().year)
    meta_anual = int(cfg.get("meta_anual") or 20)
    horas_semana = float(cfg.get("horas_semana") or 12)

    with get_db() as conn:
        raw_games = [dict(r) for r in conn.execute("SELECT * FROM games").fetchall()]
        raw_wl = [dict(r) for r in conn.execute("SELECT * FROM wishlist").fetchall()]
        raw_sess = [dict(r) for r in conn.execute("SELECT * FROM sessions ORDER BY started_at DESC").fetchall()]
        leaving = [dict(r) for r in conn.execute("SELECT * FROM gamepass_leaving").fetchall()]

    games = [compute_game_metrics(g, cfg) for g in raw_games]
    wishlist = [compute_wishlist_metrics(w) for w in raw_wl]

    total = len(games)
    playing = [g for g in games if g["status"] == "Jogando"]
    backlog_q = [g for g in games if g["status"] == "Backlog"]
    paused = [g for g in games if g["status"] == "Pausado"]
    beaten = [g for g in games if g["status"] in ("Zerado", "100% / Platina")]
    platinums = [g for g in games if g["status"] == "100% / Platina"]
    installed_count = sum(1 for g in games if g.get("installed"))

    beaten_this_year = [
        g for g in beaten if (g.get("finish_date") or "").startswith(str(ano_ref))
    ]
    remaining_hours = round(sum(g["remaining_hours"] for g in games), 1)
    total_hours_played = round(sum(float(g["hours_played"] or 0) for g in games), 1)
    total_spent = round(sum(float(g["price_paid"] or 0) for g in games), 2)
    unplayed_money = round(
        sum(float(g["price_paid"] or 0) for g in games if g["status"] in ("Backlog", "Pausado")), 2
    )
    rated = [float(g["my_rating"]) for g in games if g.get("my_rating") is not None]
    avg_rating = round(sum(rated) / len(rated), 1) if rated else None

    weeks_left = round(remaining_hours / horas_semana, 1) if horas_semana > 0 else 0
    months_left = round(remaining_hours / (horas_semana * 4.33), 1) if horas_semana > 0 else 0
    cost_per_hour_total = round(total_spent / total_hours_played, 2) if total_hours_played > 0 else 0

    # Charts data
    status_order = ["Backlog", "Jogando", "Pausado", "Zerado", "100% / Platina", "Contínuo / MP", "Dropado"]
    by_status = {s: 0 for s in status_order}
    for g in games:
        by_status[g["status"]] = by_status.get(g["status"], 0) + 1

    store_order = ["Steam", "Epic Games", "PC Game Pass", "GOG", "Amazon Prime", "EA Play", "Outro"]
    by_store = {s: {"total": 0, "beaten": 0, "hours": 0.0, "spent": 0.0} for s in store_order}
    for g in games:
        st = g["store"] if g["store"] in by_store else "Outro"
        by_store[st]["total"] += 1
        if g["status"] in ("Zerado", "100% / Platina"):
            by_store[st]["beaten"] += 1
        by_store[st]["hours"] = round(by_store[st]["hours"] + float(g["hours_played"] or 0), 1)
        by_store[st]["spent"] = round(by_store[st]["spent"] + float(g["price_paid"] or 0), 2)

    months_labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    monthly_beaten = [0] * 12
    monthly_hours = [0.0] * 12
    for g in beaten_this_year:
        try:
            m = int(g["finish_date"][5:7]) - 1
            if 0 <= m < 12:
                monthly_beaten[m] += 1
        except Exception:
            pass
    for s in raw_sess:
        st = s.get("started_at") or ""
        if st.startswith(str(ano_ref)):
            try:
                m = int(st[5:7]) - 1
                if 0 <= m < 12:
                    monthly_hours[m] = round(monthly_hours[m] + float(s["duration_minutes"] or 0) / 60.0, 1)
            except Exception:
                pass

    hltb_bands = {
        "Curto (<10h)": {"backlog": 0, "beaten": 0},
        "Médio (10-25h)": {"backlog": 0, "beaten": 0},
        "Longo (25-60h)": {"backlog": 0, "beaten": 0},
        "Épico (60h+)": {"backlog": 0, "beaten": 0},
    }
    for g in games:
        h = g.get("target_hltb") or 0
        if h <= 0:
            continue
        band = "Curto (<10h)" if h < 10 else "Médio (10-25h)" if h < 25 else "Longo (25-60h)" if h < 60 else "Épico (60h+)"
        if g["status"] == "Backlog":
            hltb_bands[band]["backlog"] += 1
        elif g["status"] in ("Zerado", "100% / Platina"):
            hltb_bands[band]["beaten"] += 1

    # Top 5 recommended next games
    candidates = [g for g in games if g.get("next_score") is not None]
    candidates.sort(key=lambda x: x["next_score"], reverse=True)
    top5 = candidates[:5]

    # Hall of fame
    best_rated = max((g for g in games if g.get("my_rating") is not None), key=lambda x: x["my_rating"], default=None)
    most_played = max((g for g in games if float(g["hours_played"] or 0) > 0), key=lambda x: float(x["hours_played"]), default=None)
    quick_win = min((g for g in backlog_q if (g.get("target_hltb") or 0) > 0), key=lambda x: x["target_hltb"], default=None)
    best_value = min((g for g in games if g.get("cost_per_hour") and g["cost_per_hour"] > 0), key=lambda x: x["cost_per_hour"], default=None)

    # Leaving Game Pass matches in user's active backlog
    active_norms = {g["norm_title"] for g in games if g["status"] not in ("Zerado", "100% / Platina", "Dropado")}
    leaving_alerts = [lv for lv in leaving if lv["norm_title"] in active_norms]

    # PC Game Pass ROI
    gp_monthly = float(cfg.get("gamepass_monthly_price") or 35.99)
    gp_hours = by_store["PC Game Pass"]["hours"]
    gp_cph = round((gp_monthly * 12) / gp_hours, 2) if gp_hours > 0 else None

    return {
        "kpis": {
            "total": total,
            "backlog": len(backlog_q),
            "playing": len(playing),
            "paused": len(paused),
            "beaten": len(beaten),
            "platinums": len(platinums),
            "completion_pct": round((len(beaten) / total) * 100.0, 1) if total > 0 else 0,
            "installed": installed_count,
            "remaining_hours": remaining_hours,
            "weeks_left": weeks_left,
            "months_left": months_left,
            "total_hours_played": total_hours_played,
            "total_spent": total_spent,
            "cost_per_hour": cost_per_hour_total,
            "unplayed_money": unplayed_money,
            "avg_rating": avg_rating,
        },
        "goal": {
            "year": ano_ref,
            "target": meta_anual,
            "completed": len(beaten_this_year),
            "pct": round(min(100.0, (len(beaten_this_year) / meta_anual) * 100.0), 1) if meta_anual > 0 else 0,
            "hours_per_week": horas_semana,
        },
        "wishlist_radar": {
            "total": len(wishlist),
            "on_gamepass": sum(1 for w in wishlist if w["signal"] == "JÁ NO GAME PASS"),
            "buy_now": sum(1 for w in wishlist if w["signal"] == "COMPRAR AGORA"),
            "hist_low": sum(1 for w in wishlist if w["signal"] == "MENOR HISTÓRICO"),
            "total_cost": round(sum(float(w["current_price"] or 0) for w in wishlist), 2),
        },
        "gamepass_roi": {
            "monthly": gp_monthly,
            "annual": round(gp_monthly * 12, 2),
            "games_count": by_store["PC Game Pass"]["total"],
            "beaten_count": by_store["PC Game Pass"]["beaten"],
            "hours": gp_hours,
            "cost_per_hour": gp_cph,
            "leaving_alerts": leaving_alerts,
        },
        "top5": top5,
        "playing_now_list": playing,
        "hall_of_fame": {
            "best_rated": {"title": best_rated["title"], "value": f"{best_rated['my_rating']}/10"} if best_rated else None,
            "most_played": {"title": most_played["title"], "value": f"{most_played['hours_played']}h"} if most_played else None,
            "quick_win": {"title": quick_win["title"], "value": f"{quick_win['target_hltb']}h"} if quick_win else None,
            "best_value": {"title": best_value["title"], "value": f"R$ {best_value['cost_per_hour']:.2f}/h"} if best_value else None,
        },
        "charts": {
            "status": {"labels": list(by_status.keys()), "values": list(by_status.values())},
            "stores": {
                "labels": store_order,
                "total": [by_store[s]["total"] for s in store_order],
                "beaten": [by_store[s]["beaten"] for s in store_order],
                "hours": [by_store[s]["hours"] for s in store_order],
            },
            "monthly": {"labels": months_labels, "beaten": monthly_beaten, "hours": monthly_hours},
            "hltb_bands": {
                "labels": list(hltb_bands.keys()),
                "backlog": [v["backlog"] for v in hltb_bands.values()],
                "beaten": [v["beaten"] for v in hltb_bands.values()],
            },
        },
    }
