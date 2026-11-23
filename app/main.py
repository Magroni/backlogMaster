import asyncio
import os
import random
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import apis
from .database import (
    DATA_DIR,
    DB_PATH,
    compute_game_metrics,
    compute_wishlist_metrics,
    get_dashboard_summary,
    get_db,
    get_resource_path,
    get_settings,
    init_db,
    normalize_title,
    save_settings,
)
from .scanner import scan_all_installed_games
from .system_win import (
    is_windows_startup_enabled,
    open_data_folder,
    set_windows_startup,
    trigger_show_window,
)
from .watcher import launch_game_on_pc, watcher

STATIC_DIR = get_resource_path(os.path.join("app", "static"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    watcher.start()
    yield
    await watcher.stop()


app = FastAPI(title="Game Backlog Master — Local PC", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# =====================================================================
# MODELS
# =====================================================================
class GameCreate(BaseModel):
    title: str
    status: str = "Backlog"
    priority: int = 2
    platform: str = "PC"
    store: str = "Steam"
    genre: str = ""
    release_year: Optional[int] = None
    hltb_main: Optional[float] = None
    hltb_extra: Optional[float] = None
    hltb_comp: Optional[float] = None
    hltb_url: str = ""
    hours_played: float = 0.0
    achievements_pct: Optional[float] = None
    critic_score: Optional[int] = None
    my_rating: Optional[float] = None
    price_paid: float = 0.0
    protondb_tier: str = ""
    steam_appid: Optional[int] = None
    cover_url: str = ""
    banner_url: str = ""
    exe_name: str = ""
    exe_path: str = ""
    install_dir: str = ""
    installed: int = 0
    purchase_date: str = ""
    start_date: str = ""
    finish_date: str = ""
    notes: str = ""


class GameUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    platform: Optional[str] = None
    store: Optional[str] = None
    genre: Optional[str] = None
    release_year: Optional[int] = None
    hltb_main: Optional[float] = None
    hltb_extra: Optional[float] = None
    hltb_comp: Optional[float] = None
    hltb_url: Optional[str] = None
    hours_played: Optional[float] = None
    achievements_pct: Optional[float] = None
    critic_score: Optional[int] = None
    my_rating: Optional[float] = None
    price_paid: Optional[float] = None
    protondb_tier: Optional[str] = None
    steam_appid: Optional[int] = None
    cover_url: Optional[str] = None
    banner_url: Optional[str] = None
    exe_name: Optional[str] = None
    exe_path: Optional[str] = None
    install_dir: Optional[str] = None
    installed: Optional[int] = None
    purchase_date: Optional[str] = None
    start_date: Optional[str] = None
    finish_date: Optional[str] = None
    notes: Optional[str] = None


class WishlistCreate(BaseModel):
    title: str
    platform: str = "PC"
    hype: str = "Quero Muito"
    release_date: str = ""
    hltb_est: Optional[float] = None
    critic_score: Optional[int] = None
    full_price: Optional[float] = None
    current_price: Optional[float] = None
    historical_low: Optional[float] = None
    target_price: Optional[float] = None
    best_store: str = ""
    gamepass_status: str = "Não"
    steam_appid: Optional[int] = None
    deal_url: str = ""
    cover_url: str = ""
    notes: str = ""


class SessionCreate(BaseModel):
    game_id: Optional[int] = None
    game_title: str
    duration_minutes: float
    fun_rating: Optional[int] = 5
    beat_status: str = "Não"
    notes: str = ""
    started_at: Optional[str] = None


class RouletteRequest(BaseModel):
    max_hours: float = 999
    store: str = "ALL"
    only_installed: bool = False
    only_high_priority: bool = False


class BindExeRequest(BaseModel):
    exe_name: str
    exe_path: str = ""
    install_dir: str = ""


# =====================================================================
# DASHBOARD & TRACKER AO VIVO
# =====================================================================
@app.get("/api/dashboard")
def api_dashboard():
    return get_dashboard_summary()


@app.get("/api/tracker/live")
def api_tracker_live():
    return watcher.get_live_status()


@app.post("/api/tracker/stop-session")
def api_tracker_stop():
    if watcher.active_session:
        watcher._finalize_session("manual_stop")
    return {"ok": True, "live": watcher.get_live_status()}


@app.get("/api/tracker/processes")
def api_tracker_processes():
    return {"processes": watcher.list_bindable_processes()}


@app.get("/api/scanner/installed")
def api_scanner_installed(force: bool = False):
    items = watcher.refresh_installed_cache(force=force)
    with get_db() as conn:
        rows = conn.execute("SELECT id, norm_title, steam_appid FROM games").fetchall()
    existing_ids = {r["steam_appid"] for r in rows if r["steam_appid"]}
    existing_norms = {r["norm_title"] for r in rows}
    enriched = []
    for it in items:
        in_db = (it.get("steam_appid") in existing_ids) or (normalize_title(it["title"]) in existing_norms)
        enriched.append({**it, "in_backlog": in_db})
    return {"installed": enriched, "count": len(enriched)}


@app.post("/api/scanner/import-installed")
def api_import_installed(payload: Optional[Dict[str, Any]] = None):
    selected_titles = set((payload or {}).get("titles") or [])
    items = watcher.refresh_installed_cache(force=True)
    today_str = date.today().isoformat()
    added = 0
    updated = 0

    with get_db() as conn:
        for it in items:
            if selected_titles and it["title"] not in selected_titles:
                continue
            norm = normalize_title(it["title"])
            row = None
            if it.get("steam_appid"):
                row = conn.execute("SELECT * FROM games WHERE steam_appid=?", (it["steam_appid"],)).fetchone()
            if not row:
                row = conn.execute("SELECT * FROM games WHERE norm_title=?", (norm,)).fetchone()

            if row:
                conn.execute(
                    """
                    UPDATE games SET installed=1,
                      exe_name=COALESCE(NULLIF(exe_name,''),?),
                      exe_path=COALESCE(NULLIF(exe_path,''),?),
                      install_dir=COALESCE(NULLIF(install_dir,''),?),
                      cover_url=COALESCE(NULLIF(cover_url,''),?),
                      banner_url=COALESCE(NULLIF(banner_url,''),?),
                      updated_at=datetime('now','localtime')
                    WHERE id=?
                    """,
                    (
                        it.get("exe_name", ""), it.get("exe_path", ""), it.get("install_dir", ""),
                        it.get("cover_url", ""), it.get("banner_url", ""), row["id"],
                    ),
                )
                updated += 1
            else:
                conn.execute(
                    """
                    INSERT INTO games(
                        title, norm_title, status, priority, platform, store,
                        steam_appid, epic_id, xbox_id, cover_url, banner_url,
                        exe_name, exe_path, install_dir, installed, purchase_date
                    ) VALUES (?, ?, 'Backlog', 2, 'PC', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    """,
                    (
                        it["title"], norm, it.get("store", "Steam"),
                        it.get("steam_appid"), it.get("epic_id", ""), it.get("xbox_id", ""),
                        it.get("cover_url", ""), it.get("banner_url", ""),
                        it.get("exe_name", ""), it.get("exe_path", ""), it.get("install_dir", ""),
                        today_str,
                    ),
                )
                added += 1
    return {"ok": True, "added": added, "updated": updated}


# =====================================================================
# GAMES CRUD + ENRICH + LAUNCH + BIND EXE
# =====================================================================
@app.get("/api/games")
def api_list_games(
    q: str = "",
    status: str = "ALL",
    store: str = "ALL",
    installed_only: bool = False,
):
    cfg = get_settings()
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM games ORDER BY updated_at DESC").fetchall()]
    games = [compute_game_metrics(g, cfg) for g in rows]

    if q:
        qn = normalize_title(q)
        games = [g for g in games if qn in g["norm_title"] or qn in (g.get("genre") or "").lower()]
    if status != "ALL":
        games = [g for g in games if g["status"] == status]
    if store != "ALL":
        games = [g for g in games if g["store"] == store]
    if installed_only:
        games = [g for g in games if g.get("installed")]
    return {"games": games}


@app.post("/api/games")
def api_create_game(body: GameCreate):
    norm = normalize_title(body.title)
    today_str = date.today().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO games(
                title, norm_title, status, priority, platform, store, genre, release_year,
                hltb_main, hltb_extra, hltb_comp, hltb_url, hours_played, achievements_pct,
                critic_score, my_rating, price_paid, protondb_tier, steam_appid,
                cover_url, banner_url, exe_name, exe_path, install_dir, installed,
                purchase_date, start_date, finish_date, notes
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                body.title.strip(), norm, body.status, body.priority, body.platform, body.store,
                body.genre, body.release_year, body.hltb_main, body.hltb_extra, body.hltb_comp,
                body.hltb_url, body.hours_played, body.achievements_pct, body.critic_score,
                body.my_rating, body.price_paid, body.protondb_tier, body.steam_appid,
                body.cover_url, body.banner_url, body.exe_name, body.exe_path, body.install_dir,
                body.installed, body.purchase_date or today_str,
                body.start_date or (today_str if body.status == "Jogando" else ""),
                body.finish_date or (today_str if body.status in ("Zerado", "100% / Platina") else ""),
                body.notes,
            ),
        )
        row = dict(conn.execute("SELECT * FROM games WHERE id=?", (cur.lastrowid,)).fetchone())
    return compute_game_metrics(row, get_settings())


@app.patch("/api/games/{game_id}")
def api_update_game(game_id: int, body: GameUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "Nenhum campo enviado")

    today_str = date.today().isoformat()
    if "title" in updates and updates["title"]:
        updates["norm_title"] = normalize_title(updates["title"])

    with get_db() as conn:
        cur_row = conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
        if not cur_row:
            raise HTTPException(404, "Jogo não encontrado")
        if updates.get("status") == "Jogando" and not cur_row["start_date"] and "start_date" not in updates:
            updates["start_date"] = today_str
        if updates.get("status") in ("Zerado", "100% / Platina") and not cur_row["finish_date"] and "finish_date" not in updates:
            updates["finish_date"] = today_str

        cols = ", ".join(f"{k}=?" for k in updates.keys()) + ", updated_at=datetime('now','localtime')"
        conn.execute(f"UPDATE games SET {cols} WHERE id=?", (*updates.values(), game_id))
        row = dict(conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone())
    return compute_game_metrics(row, get_settings())


@app.delete("/api/games/{game_id}")
def api_delete_game(game_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM games WHERE id=?", (game_id,))
    return {"ok": True}


@app.post("/api/games/{game_id}/bind-exe")
def api_bind_exe(game_id: int, body: BindExeRequest):
    with get_db() as conn:
        conn.execute(
            "UPDATE games SET exe_name=?, exe_path=?, install_dir=?, installed=1, "
            "updated_at=datetime('now','localtime') WHERE id=?",
            (body.exe_name, body.exe_path, body.install_dir, game_id),
        )
        row = conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Jogo não encontrado")
    return compute_game_metrics(dict(row), get_settings())


@app.post("/api/games/{game_id}/launch")
def api_launch_game(game_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Jogo não encontrado")
    return launch_game_on_pc(dict(row))


@app.post("/api/games/{game_id}/enrich")
async def api_enrich_game(game_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Jogo não encontrado")
        g = dict(row)

    data = await apis.fetch_unified_game(g["title"], g.get("steam_appid"))
    with get_db() as conn:
        conn.execute(
            """
            UPDATE games SET
              genre=COALESCE(NULLIF(?, ''), genre),
              release_year=COALESCE(?, release_year),
              hltb_main=COALESCE(?, hltb_main),
              hltb_extra=COALESCE(?, hltb_extra),
              hltb_comp=COALESCE(?, hltb_comp),
              hltb_url=COALESCE(NULLIF(?, ''), hltb_url),
              critic_score=COALESCE(?, critic_score),
              protondb_tier=COALESCE(NULLIF(?, ''), protondb_tier),
              steam_appid=COALESCE(?, steam_appid),
              cover_url=COALESCE(NULLIF(?, ''), cover_url),
              banner_url=COALESCE(NULLIF(?, ''), banner_url),
              updated_at=datetime('now','localtime')
            WHERE id=?
            """,
            (
                data.get("genre", ""), data.get("release_year"),
                data.get("hltb_main"), data.get("hltb_extra"), data.get("hltb_comp"),
                data.get("hltb_url", ""), data.get("critic_score"), data.get("protondb_tier", ""),
                data.get("steam_appid"), data.get("cover_url", ""), data.get("banner_url", ""),
                game_id,
            ),
        )
        updated = dict(conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone())
    return compute_game_metrics(updated, get_settings())


@app.post("/api/games/enrich-missing")
async def api_enrich_missing(limit: int = 15):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, steam_appid FROM games "
            "WHERE hltb_main IS NULL OR cover_url='' OR genre='' LIMIT ?",
            (limit,),
        ).fetchall()

    enriched = 0
    for r in rows:
        try:
            await api_enrich_game(r["id"])
            enriched += 1
        except Exception:
            continue
    return {"ok": True, "enriched": enriched}


# =====================================================================
# BUSCA UNIFICADA + STEAM IMPORT / SYNC
# =====================================================================
@app.get("/api/search")
async def api_search_games(q: str = Query(..., min_length=2)):
    steam_list = await apis.steam_search_games(q, limit=8)
    top_unified = await apis.fetch_unified_game(q, steam_list[0]["steam_appid"] if steam_list else None)
    return {"best": top_unified, "suggestions": steam_list}


@app.get("/api/search/lookup")
async def api_search_lookup(title: str, steam_appid: Optional[int] = None):
    return await apis.fetch_unified_game(title, steam_appid)


@app.post("/api/steam/import-library")
async def api_steam_import_library():
    res = await apis.fetch_steam_owned_games()
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    games = sorted(res["games"], key=lambda x: x.get("playtime_forever", 0), reverse=True)
    added, updated = 0, 0
    today_str = date.today().isoformat()

    with get_db() as conn:
        for g in games:
            appid = g["appid"]
            name = g.get("name") or f"Steam App {appid}"
            hours = round((g.get("playtime_forever") or 0) / 60.0, 1)
            norm = normalize_title(name)
            row = conn.execute("SELECT id, hours_played FROM games WHERE steam_appid=? OR norm_title=?", (appid, norm)).fetchone()
            if row:
                if hours > float(row["hours_played"] or 0):
                    conn.execute("UPDATE games SET hours_played=?, steam_appid=? WHERE id=?", (hours, appid, row["id"]))
                updated += 1
            else:
                status = "Pausado" if hours >= 1 else "Backlog"
                conn.execute(
                    """
                    INSERT INTO games(
                        title, norm_title, status, priority, platform, store,
                        hours_played, steam_appid, cover_url, banner_url, purchase_date
                    ) VALUES (?, ?, ?, 3, 'PC', 'Steam', ?, ?, ?, ?, ?)
                    """,
                    (
                        name, norm, status, hours, appid,
                        f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900_2x.jpg",
                        f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg",
                        today_str,
                    ),
                )
                added += 1
    return {"ok": True, "total_steam": len(games), "added": added, "updated": updated}


@app.post("/api/steam/sync-stats")
async def api_steam_sync_stats():
    res = await apis.fetch_steam_owned_games()
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    playtime_map = {g["appid"]: round((g.get("playtime_forever") or 0) / 60.0, 1) for g in res["games"]}

    with get_db() as conn:
        rows = conn.execute("SELECT id, steam_appid, hours_played FROM games WHERE steam_appid IS NOT NULL").fetchall()

    updated = 0
    for r in rows:
        appid = r["steam_appid"]
        hrs = playtime_map.get(appid)
        ach = await apis.fetch_steam_achievements_pct(appid)
        with get_db() as conn:
            if hrs is not None and hrs > float(r["hours_played"] or 0):
                conn.execute("UPDATE games SET hours_played=? WHERE id=?", (hrs, r["id"]))
                updated += 1
            if ach is not None:
                conn.execute("UPDATE games SET achievements_pct=? WHERE id=?", (ach, r["id"]))
    return {"ok": True, "updated": updated}


# =====================================================================
# WISHLIST + GAME PASS CHECK + STEAM WISHLIST IMPORT
# =====================================================================
@app.get("/api/wishlist")
def api_list_wishlist():
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM wishlist ORDER BY id DESC").fetchall()]
    return {"wishlist": [compute_wishlist_metrics(w) for w in rows]}


@app.post("/api/wishlist")
def api_create_wishlist(body: WishlistCreate):
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO wishlist(
                title, norm_title, platform, hype, release_date, hltb_est, critic_score,
                full_price, current_price, historical_low, target_price, best_store,
                gamepass_status, steam_appid, deal_url, cover_url, notes, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
            """,
            (
                body.title.strip(), normalize_title(body.title), body.platform, body.hype,
                body.release_date, body.hltb_est, body.critic_score, body.full_price,
                body.current_price, body.historical_low, body.target_price, body.best_store,
                body.gamepass_status, body.steam_appid, body.deal_url, body.cover_url, body.notes,
            ),
        )
        row = dict(conn.execute("SELECT * FROM wishlist WHERE id=?", (cur.lastrowid,)).fetchone())
    return compute_wishlist_metrics(row)


@app.patch("/api/wishlist/{wl_id}")
def api_update_wishlist(wl_id: int, body: Dict[str, Any]):
    allowed = {"target_price", "hype", "notes", "current_price", "gamepass_status"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Nenhum campo válido")
    with get_db() as conn:
        cols = ", ".join(f"{k}=?" for k in updates.keys())
        conn.execute(f"UPDATE wishlist SET {cols} WHERE id=?", (*updates.values(), wl_id))
        row = conn.execute("SELECT * FROM wishlist WHERE id=?", (wl_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Item não encontrado")
    return compute_wishlist_metrics(dict(row))


@app.delete("/api/wishlist/{wl_id}")
def api_delete_wishlist(wl_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM wishlist WHERE id=?", (wl_id,))
    return {"ok": True}


@app.post("/api/wishlist/{wl_id}/move-to-backlog")
def api_wishlist_to_backlog(wl_id: int, store: str = "Steam", price_paid: Optional[float] = None):
    with get_db() as conn:
        w = conn.execute("SELECT * FROM wishlist WHERE id=?", (wl_id,)).fetchone()
        if not w:
            raise HTTPException(404, "Item não encontrado")
        w = dict(w)
        paid = price_paid if price_paid is not None else float(w.get("current_price") or 0)
        if "Game Pass" in str(w.get("gamepass_status") or ""):
            store = "PC Game Pass"
            paid = 0.0
        cur = conn.execute(
            """
            INSERT INTO games(
                title, norm_title, status, priority, platform, store,
                hltb_extra, critic_score, price_paid, steam_appid, cover_url, purchase_date
            ) VALUES (?, ?, 'Backlog', 2, 'PC', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                w["title"], w["norm_title"], store, w.get("hltb_est"), w.get("critic_score"),
                paid, w.get("steam_appid"), w.get("cover_url") or "", date.today().isoformat(),
            ),
        )
        conn.execute("DELETE FROM wishlist WHERE id=?", (wl_id,))
        new_game = dict(conn.execute("SELECT * FROM games WHERE id=?", (cur.lastrowid,)).fetchone())
    return compute_game_metrics(new_game, get_settings())


@app.post("/api/wishlist/refresh-all")
async def api_wishlist_refresh_all():
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM wishlist").fetchall()]
    updated = 0
    for w in rows:
        try:
            u = await apis.fetch_unified_game(w["title"], w.get("steam_appid"))
            with get_db() as conn:
                conn.execute(
                    """
                    UPDATE wishlist SET
                      hltb_est=COALESCE(?, hltb_est),
                      critic_score=COALESCE(?, critic_score),
                      full_price=COALESCE(?, full_price),
                      current_price=COALESCE(?, current_price),
                      historical_low=COALESCE(?, historical_low),
                      best_store=COALESCE(NULLIF(?,''), best_store),
                      gamepass_status=?,
                      steam_appid=COALESCE(?, steam_appid),
                      deal_url=COALESCE(NULLIF(?,''), deal_url),
                      cover_url=COALESCE(NULLIF(?,''), cover_url),
                      updated_at=datetime('now','localtime')
                    WHERE id=?
                    """,
                    (
                        u.get("hltb_extra") or u.get("hltb_main"), u.get("critic_score"),
                        u.get("full_price"), u.get("current_price"), u.get("historical_low"),
                        u.get("best_store", ""), u.get("gamepass_status", "Não"),
                        u.get("steam_appid"), u.get("deal_url", ""), u.get("cover_url", ""), w["id"],
                    ),
                )
            updated += 1
        except Exception:
            continue
    return {"ok": True, "updated": updated}


@app.post("/api/steam/import-wishlist")
async def api_steam_import_wishlist():
    res = await apis.fetch_steam_wishlist()
    if not res["ok"]:
        raise HTTPException(400, res["error"])
    items = sorted(res["items"], key=lambda x: x.get("priority") or 9999)[:40]
    added = 0
    with get_db() as conn:
        existing = {r["steam_appid"] for r in conn.execute("SELECT steam_appid FROM wishlist WHERE steam_appid IS NOT NULL").fetchall()}

    for it in items:
        appid = it.get("appid")
        if not appid or appid in existing:
            continue
        det = await apis.steam_get_app_details(appid)
        if not det or not det.get("title"):
            continue
        gp = await apis.check_gamepass_status(det["title"])
        fp = det.get("full_price")
        target = round(fp * 0.5, 2) if fp else None
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO wishlist(
                    title, norm_title, platform, hype, hltb_est, critic_score,
                    full_price, current_price, target_price, best_store,
                    gamepass_status, steam_appid, deal_url, cover_url, updated_at
                ) VALUES (?, ?, 'PC', ?, NULL, ?, ?, ?, ?, 'Steam', ?, ?, ?, ?, datetime('now','localtime'))
                """,
                (
                    det["title"], normalize_title(det["title"]),
                    "Day One" if (it.get("priority") or 99) <= 5 else "Quero Muito",
                    det.get("metacritic"), fp, det.get("current_price"), target,
                    gp, appid, det.get("store_url", ""), det.get("cover_url", ""),
                ),
            )
        added += 1
    return {"ok": True, "added": added}


# =====================================================================
# EPIC FREEBIES & PC GAME PASS LEAVING SOON
# =====================================================================
@app.get("/api/hub/free-and-gamepass")
def api_hub_free_gp():
    with get_db() as conn:
        freebies = [dict(r) for r in conn.execute("SELECT * FROM epic_freebies ORDER BY status DESC, id ASC").fetchall()]
        leaving = [dict(r) for r in conn.execute("SELECT * FROM gamepass_leaving ORDER BY title ASC").fetchall()]
        active_norms = {
            r["norm_title"]
            for r in conn.execute("SELECT norm_title FROM games WHERE status NOT IN ('Zerado','100% / Platina','Dropado')").fetchall()
        }
    for lv in leaving:
        lv["in_backlog"] = lv["norm_title"] in active_norms
    return {"epic_freebies": freebies, "gamepass_leaving": leaving}


@app.post("/api/hub/sync-epic")
async def api_sync_epic():
    items = await apis.sync_epic_freebies_to_db()
    return {"ok": True, "count": len(items), "items": items}


@app.post("/api/hub/epic/{item_id}/claim")
def api_claim_epic(item_id: int, claimed: int = 1):
    with get_db() as conn:
        conn.execute("UPDATE epic_freebies SET claimed=? WHERE id=?", (claimed, item_id))
    return {"ok": True}


@app.post("/api/hub/sync-gamepass-leaving")
async def api_sync_gp_leaving():
    items = await apis.sync_gamepass_leaving_to_db()
    return {"ok": True, "count": len(items), "items": items}


# =====================================================================
# SESSÕES + ROLETA + CONFIGURAÇÕES
# =====================================================================
@app.get("/api/sessions")
def api_list_sessions(limit: int = 100):
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,)).fetchall()]
    return {"sessions": rows}


@app.post("/api/sessions")
def api_create_session(body: SessionCreate):
    started = body.started_at or datetime.now().isoformat(timespec="seconds")
    today_str = date.today().isoformat()
    added_hours = round(float(body.duration_minutes) / 60.0, 2)
    with get_db() as conn:
        store = ""
        gid = body.game_id
        if gid:
            g = conn.execute("SELECT * FROM games WHERE id=?", (gid,)).fetchone()
        else:
            g = conn.execute("SELECT * FROM games WHERE norm_title=?", (normalize_title(body.game_title),)).fetchone()
            gid = g["id"] if g else None
        if g:
            store = g["store"]
            new_status = g["status"]
            finish_d = g["finish_date"]
            if body.beat_status in ("Zerado", "100% / Platina"):
                new_status = body.beat_status
                finish_d = today_str
            elif g["status"] in ("Backlog", "Pausado"):
                new_status = "Jogando"
            conn.execute(
                """
                UPDATE games SET
                  hours_played=ROUND(hours_played + ?, 2),
                  status=?,
                  start_date=COALESCE(NULLIF(start_date,''),?),
                  finish_date=?,
                  last_played_at=?,
                  updated_at=datetime('now','localtime')
                WHERE id=?
                """,
                (added_hours, new_status, today_str, finish_d, started, gid),
            )
        cur = conn.execute(
            """
            INSERT INTO sessions(game_id, game_title, store, started_at, ended_at, duration_minutes, fun_rating, beat_status, auto_detected, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (gid, body.game_title, store, started, started, body.duration_minutes, body.fun_rating, body.beat_status, body.notes),
        )
        row = dict(conn.execute("SELECT * FROM sessions WHERE id=?", (cur.lastrowid,)).fetchone())
    return row


@app.delete("/api/sessions/{sess_id}")
def api_delete_session(sess_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (sess_id,))
    return {"ok": True}


@app.post("/api/roulette")
def api_roulette(body: RouletteRequest):
    cfg = get_settings()
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM games WHERE status IN ('Backlog','Pausado')").fetchall()]
    games = [compute_game_metrics(g, cfg) for g in rows]
    cands = []
    for g in games:
        if body.store != "ALL" and g["store"] != body.store:
            continue
        if body.only_installed and not g.get("installed"):
            continue
        if body.only_high_priority and int(g.get("priority") or 3) > 2:
            continue
        h = g.get("target_hltb") or 0
        if h > 0 and h > body.max_hours:
            continue
        cands.append(g)

    if not cands:
        return {"ok": False, "message": "Nenhum jogo encontrado com esses filtros!"}

    weights = [max(10.0, float(c.get("next_score") or 50.0)) for c in cands]
    picked = random.choices(cands, weights=weights, k=1)[0]
    cands.sort(key=lambda x: float(x.get("next_score") or 0), reverse=True)
    return {"ok": True, "picked": picked, "total_candidates": len(cands), "top3": cands[:3]}


@app.get("/api/settings")
def api_get_settings():
    return get_settings()


@app.post("/api/settings")
def api_save_settings(body: Dict[str, Any]):
    saved = save_settings(body)
    watcher.refresh_installed_cache(force=True)
    return saved


# =====================================================================
# INTEGRAÇÃO DESKTOP WINDOWS (STARTUP, PASTA DE DADOS, JANELA)
# =====================================================================
@app.get("/api/system/info")
def api_system_info():
    return {
        "data_dir": DATA_DIR,
        "db_path": DB_PATH,
        "windows_startup": is_windows_startup_enabled(),
    }


@app.post("/api/system/startup")
def api_system_startup(body: Dict[str, Any]):
    enabled = bool(body.get("enabled"))
    ok = set_windows_startup(enabled)
    return {"ok": ok, "windows_startup": is_windows_startup_enabled()}


@app.post("/api/system/open-data-dir")
def api_system_open_data_dir():
    open_data_folder()
    return {"ok": True, "data_dir": DATA_DIR}


@app.post("/api/system/show-window")
def api_system_show_window():
    shown = trigger_show_window()
    return {"ok": shown}
