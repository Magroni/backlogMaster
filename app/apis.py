"""
Camada assíncrona de APIs (HTTPX + howlongtobeatpy + cache SQLite de 6h):
  - HowLongToBeat (howlongtobeatpy async direto do seu PC!)
  - Steam Store API (BR) + Steam Web API (Biblioteca, Wishlist, Conquistas, Reviews)
  - ProtonDB API (compatibilidade Linux / Steam Deck)
  - Microsoft PC Game Pass API (Catálogo PC + EA Play + Saindo em Breve — sem chave!)
  - Epic Games Store Freebies API (Jogos Grátis da Semana — sem chave!)
  - CheapShark API (30+ lojas PC + Menor Histórico — sem chave!)
  - IsThereAnyDeal v2 (BRL nativo incluindo Nuuvem — chave opcional)
  - GOG Catalog API (sem chave!)
  - RAWG.io & IGDB v4 (opcionais)
"""

import asyncio
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from howlongtobeatpy import HowLongToBeat

from .database import cache_get, cache_set, get_db, get_settings, normalize_title

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

GP_SIGLS = {
    "PC_ALL": "fdd9e2a7-0fee-49f6-ad69-4354098401ff",
    "EA_PLAY": "b8900d09-a491-44cc-916e-32b5acae621b",
    "LEAVING_SOON": "393f05bf-e596-4ef6-9487-6d4fa0eab987",
}


def _sim(a: str, b: str) -> float:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if nb.startswith(na) or na.startswith(nb):
        return 0.85 * (min(len(na), len(nb)) / max(len(na), len(nb))) + 0.12
    ta, tb = set(na.split()), set(nb.split())
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def map_genre_pt(raw: str) -> str:
    g = (raw or "").lower()
    if "metroidvania" in g:
        return "Metroidvania"
    if "roguelike" in g or "roguelite" in g:
        return "Roguelike"
    if "jrpg" in g:
        return "JRPG"
    if "rpg" in g or "role-playing" in g or "souls" in g:
        return "RPG de Ação"
    if "shooter" in g or "fps" in g or "tiro" in g:
        return "FPS"
    if "horror" in g or "terror" in g:
        return "Terror"
    if "platform" in g or "plataforma" in g:
        return "Plataforma"
    if "strategy" in g or "estrat" in g or "tactical" in g:
        return "Estratégia"
    if "puzzle" in g or "quebra" in g:
        return "Puzzle"
    if "racing" in g or "corrida" in g:
        return "Corrida"
    if "fighting" in g or "luta" in g:
        return "Luta"
    if "simulat" in g or "simul" in g:
        return "Simulação"
    if "open world" in g or "mundo aberto" in g:
        return "Mundo Aberto"
    if "indie" in g:
        return "Indie"
    if "adventure" in g or "aventura" in g or "action" in g or "ação" in g:
        return "Aventura"
    return raw or "Aventura"


def _usd_to_local(usd: Optional[float]) -> Optional[float]:
    if usd is None:
        return None
    cfg = get_settings()
    rate = float(cfg.get("usd_to_brl") or 5.8)
    if cfg.get("currency", "BRL").upper() == "USD":
        return round(float(usd), 2)
    return round(float(usd) * rate, 2)


# =====================================================================
# 1. HOWLONGTOBEAT (howlongtobeatpy async)
# =====================================================================
async def fetch_hltb(title: str) -> Optional[Dict[str, Any]]:
    if not title:
        return None
    ck = "hltb_" + normalize_title(title)
    cached = cache_get(ck)
    if cached is not None:
        return cached

    try:
        results = await HowLongToBeat().async_search(title)
        if not results:
            return None
        best = max(results, key=lambda x: (_sim(title, x.game_name) + (x.similarity or 0)) / 2.0)
        out = {
            "id": best.game_id,
            "name": best.game_name,
            "main": round(float(best.main_story), 1) if best.main_story else None,
            "extra": round(float(best.main_extra), 1) if best.main_extra else None,
            "comp": round(float(best.completionist), 1) if best.completionist else None,
            "review_score": getattr(best, "review_score", None),
            "year": getattr(best, "release_world", None),
            "cover_url": best.game_image_url or "",
            "url": best.game_web_link or f"https://howlongtobeat.com/game/{best.game_id}",
        }
        cache_set(ck, out, 43200)  # 12h
        return out
    except Exception:
        return None


# =====================================================================
# 2. STEAM STORE API + STEAM WEB API + PROTONDB
# =====================================================================
async def steam_search_games(query: str, limit: int = 8) -> List[Dict[str, Any]]:
    if not query:
        return []
    cfg = get_settings()
    cc = cfg.get("country", "BR")
    ck = f"steam_search_{cc}_{normalize_title(query)}"
    cached = cache_get(ck)
    if cached is not None:
        return cached[:limit]

    url = "https://store.steampowered.com/api/storesearch/"
    params = {"term": query, "l": "brazilian", "cc": cc}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            items = r.json().get("items") or []
            out = []
            for it in items[:limit]:
                appid = it.get("id")
                price_info = it.get("price") or {}
                final_p = round(price_info["final"] / 100.0, 2) if "final" in price_info else None
                init_p = round(price_info["initial"] / 100.0, 2) if "initial" in price_info else final_p
                out.append({
                    "steam_appid": appid,
                    "title": it.get("name", ""),
                    "current_price": final_p,
                    "full_price": init_p,
                    "cover_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900_2x.jpg",
                    "banner_url": it.get("tiny_image") or f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg",
                    "metascore": int(it["metascore"]) if str(it.get("metascore", "")).isdigit() else None,
                })
            cache_set(ck, out, 21600)
            return out
    except Exception:
        return []


async def steam_get_app_details(appid: int) -> Optional[Dict[str, Any]]:
    if not appid:
        return None
    cfg = get_settings()
    cc = cfg.get("country", "BR")
    ck = f"steam_det_{cc}_{appid}"
    cached = cache_get(ck)
    if cached is not None:
        return cached

    url = "https://store.steampowered.com/api/appdetails"
    params = {"appids": str(appid), "cc": cc, "l": "brazilian"}
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return None
            payload = r.json().get(str(appid)) or {}
            if not payload.get("success"):
                return None
            d = payload.get("data") or {}
            po = d.get("price_overview")
            is_free = bool(d.get("is_free"))
            year = None
            rd = (d.get("release_date") or {}).get("date") or ""
            ym = re.search(r"\b(19|20)\d{2}\b", str(rd))
            if ym:
                year = int(ym.group(0))
            genres = [g.get("description", "") for g in (d.get("genres") or []) if g.get("description")]
            out = {
                "steam_appid": int(appid),
                "title": d.get("name", ""),
                "is_free": is_free,
                "full_price": round(po["initial"] / 100.0, 2) if po else (0.0 if is_free else None),
                "current_price": round(po["final"] / 100.0, 2) if po else (0.0 if is_free else None),
                "discount_pct": po.get("discount_percent", 0) if po else 0,
                "metacritic": (d.get("metacritic") or {}).get("score"),
                "genre": map_genre_pt(genres[0]) if genres else "",
                "year": year,
                "developers": ", ".join(d.get("developers") or []),
                "cover_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900_2x.jpg",
                "banner_url": d.get("header_image") or f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg",
                "store_url": f"https://store.steampowered.com/app/{appid}",
            }
            cache_set(ck, out, 21600)
            return out
    except Exception:
        return None


async def fetch_protondb_tier(appid: Optional[int]) -> str:
    if not appid:
        return ""
    ck = f"proton_{appid}"
    cached = cache_get(ck)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": UA}) as client:
            r = await client.get(f"https://www.protondb.com/api/v1/reports/summaries/{appid}.json")
            if r.status_code != 200:
                return ""
            tier = (r.json().get("tier") or "").lower()
            mapping = {
                "native": "Verified",
                "platinum": "Platinum",
                "gold": "Gold",
                "silver": "Silver",
                "bronze": "Bronze",
                "borked": "Unsupported",
            }
            val = mapping.get(tier, "")
            cache_set(ck, val, 86400)
            return val
    except Exception:
        return ""


async def fetch_steam_owned_games() -> Dict[str, Any]:
    cfg = get_settings()
    key = (cfg.get("steam_api_key") or "").strip()
    sid = (cfg.get("steam_id") or "").strip()
    if not key or not sid:
        return {"ok": False, "error": "Configure Steam Web API Key e SteamID64 em Configurações."}

    url = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"
    params = {
        "key": key,
        "steamid": sid,
        "include_appinfo": 1,
        "include_played_free_games": 1 if cfg.get("include_f2p", "1") == "1" else 0,
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return {"ok": False, "error": f"Steam HTTP {r.status_code}"}
            games = (r.json().get("response") or {}).get("games") or []
            return {"ok": True, "games": games}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def fetch_steam_wishlist() -> Dict[str, Any]:
    cfg = get_settings()
    key = (cfg.get("steam_api_key") or "").strip()
    sid = (cfg.get("steam_id") or "").strip()
    if not sid:
        return {"ok": False, "error": "Configure seu SteamID64 em Configurações."}

    url = "https://api.steampowered.com/IWishlistService/GetWishlist/v1/"
    params = {"steamid": sid}
    if key:
        params["key"] = key
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return {"ok": False, "error": f"Steam HTTP {r.status_code}"}
            items = (r.json().get("response") or {}).get("items") or []
            return {"ok": True, "items": items}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def fetch_steam_achievements_pct(appid: int) -> Optional[float]:
    cfg = get_settings()
    key = (cfg.get("steam_api_key") or "").strip()
    sid = (cfg.get("steam_id") or "").strip()
    if not key or not sid or not appid:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/",
                params={"appid": appid, "key": key, "steamid": sid},
            )
            if r.status_code != 200:
                return None
            achs = (r.json().get("playerstats") or {}).get("achievements") or []
            if not achs:
                return None
            unlocked = sum(1 for a in achs if a.get("achieved") == 1)
            return round((unlocked / len(achs)) * 100.0, 1)
    except Exception:
        return None


# =====================================================================
# 3. MICROSOFT PC GAME PASS API (SEM CHAVE!)
# =====================================================================
async def _gp_sigl_ids(sigl_id: str) -> List[str]:
    cfg = get_settings()
    market = cfg.get("country", "BR")
    lang = "pt-br" if market == "BR" else "en-us"
    ck = f"gp_sigl_{sigl_id}_{market}"
    cached = cache_get(ck)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
            r = await client.get(
                "https://catalog.gamepass.com/sigls/v2",
                params={"id": sigl_id, "language": lang, "market": market},
            )
            if r.status_code != 200:
                return []
            ids = [str(it["id"]) for it in r.json() if isinstance(it, dict) and it.get("id")]
            cache_set(ck, ids, 21600)
            return ids
    except Exception:
        return []


async def _ms_store_products(big_ids: List[str]) -> List[Dict[str, Any]]:
    if not big_ids:
        return []
    cfg = get_settings()
    market = cfg.get("country", "BR")
    lang = "pt-br" if market == "BR" else "en-us"
    out = []
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": UA}) as client:
        for i in range(0, len(big_ids), 20):
            chunk = big_ids[i : i + 20]
            try:
                r = await client.get(
                    "https://displaycatalog.mp.microsoft.com/v7.0/products",
                    params={
                        "bigIds": ",".join(chunk),
                        "market": market,
                        "languages": lang,
                        "MS-CV": "DGU1mcuYo0WMMp+F.1",
                    },
                )
                if r.status_code != 200:
                    continue
                for p in r.json().get("Products") or []:
                    lp = (p.get("LocalizedProperties") or [{}])[0]
                    title = lp.get("ProductTitle") or ""
                    if not title:
                        continue
                    cover = ""
                    for img in lp.get("Images") or []:
                        if img.get("ImagePurpose") in ("BrandedKeyArt", "Poster", "SuperHeroArt", "BoxArt"):
                            uri = img.get("Uri") or ""
                            cover = ("https:" + uri) if uri.startswith("//") else uri
                            break
                    out.append({
                        "product_id": p.get("ProductId", ""),
                        "title": title,
                        "norm_title": normalize_title(title),
                        "publisher": lp.get("PublisherName") or "",
                        "cover_url": cover,
                        "store_url": f"https://www.xbox.com/pt-br/games/store/game/{p.get('ProductId', '')}",
                    })
            except Exception:
                continue
    return out


async def get_gamepass_index() -> Dict[str, Any]:
    ck = "gp_pc_full_index_v1"
    cached = cache_get(ck)
    if cached is not None:
        return cached

    pc_ids, ea_ids, leaving_ids = await asyncio.gather(
        _gp_sigl_ids(GP_SIGLS["PC_ALL"]),
        _gp_sigl_ids(GP_SIGLS["EA_PLAY"]),
        _gp_sigl_ids(GP_SIGLS["LEAVING_SOON"]),
    )
    all_ids = list(dict.fromkeys(pc_ids + ea_ids))
    all_products, leaving_products = await asyncio.gather(
        _ms_store_products(all_ids[:420]),
        _ms_store_products(leaving_ids),
    )
    idx = {
        "all_norms": [p["norm_title"] for p in all_products],
        "leaving": leaving_products,
        "leaving_norms": [p["norm_title"] for p in leaving_products],
    }
    cache_set(ck, idx, 21600)
    return idx


async def check_gamepass_status(title: str) -> str:
    if not title:
        return "Não"
    norm = normalize_title(title)
    if not norm:
        return "Não"
    idx = await get_gamepass_index()

    def _matches(lst: List[str]) -> bool:
        for t in lst:
            if t == norm:
                return True
            if len(norm) >= 5 and (t.startswith(norm + " ") or norm.startswith(t + " ")):
                return True
        return False

    if _matches(idx.get("leaving_norms") or []):
        return "🚨 Saindo do Game Pass!"
    if _matches(idx.get("all_norms") or []):
        return "✅ No PC Game Pass"
    return "Não"


async def sync_gamepass_leaving_to_db() -> List[Dict[str, Any]]:
    leaving_ids = await _gp_sigl_ids(GP_SIGLS["LEAVING_SOON"])
    products = await _ms_store_products(leaving_ids)
    with get_db() as conn:
        conn.execute("DELETE FROM gamepass_leaving")
        for p in products:
            conn.execute(
                """
                INSERT OR REPLACE INTO gamepass_leaving(product_id, title, norm_title, publisher, cover_url, store_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (p["product_id"], p["title"], p["norm_title"], p["publisher"], p["cover_url"], p["store_url"]),
            )
    return products


# =====================================================================
# 4. EPIC GAMES STORE FREEBIES (SEM CHAVE!)
# =====================================================================
async def sync_epic_freebies_to_db() -> List[Dict[str, Any]]:
    cfg = get_settings()
    cc = cfg.get("country", "BR")
    locale = "pt-BR" if cc == "BR" else "en-US"
    url = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": UA}) as client:
            r = await client.get(url, params={"locale": locale, "country": cc, "allowCountries": cc})
            if r.status_code != 200:
                return []
            elements = (((r.json().get("data") or {}).get("Catalog") or {}).get("searchStore") or {}).get("elements") or []
    except Exception:
        return []

    items = []
    for el in elements:
        promos = el.get("promotions")
        if not promos:
            continue
        for grp_key, label in (("promotionalOffers", "GRÁTIS AGORA"), ("upcomingPromotionalOffers", "EM BREVE")):
            for grp in promos.get(grp_key) or []:
                for offer in grp.get("promotionalOffers") or []:
                    ds = offer.get("discountSetting") or {}
                    if ds.get("discountPercentage") != 0:
                        continue
                    slug = el.get("productSlug") or ""
                    if not slug:
                        maps = (el.get("catalogNs") or {}).get("mappings") or el.get("offerMappings") or []
                        if maps:
                            slug = maps[0].get("pageSlug") or ""
                    slug = slug.replace("/home", "")
                    link = f"https://store.epicgames.com/pt-BR/p/{slug}" if slug else "https://store.epicgames.com/pt-BR/free-games"
                    cover = ""
                    for img in el.get("keyImages") or []:
                        if img.get("type") in ("OfferImageWide", "DieselStoreFrontWide", "Thumbnail"):
                            cover = img.get("url") or ""
                            break
                    orig_price = (((el.get("price") or {}).get("totalPrice") or {}).get("fmtPrice") or {}).get("originalPrice") or ""
                    items.append({
                        "title": el.get("title", ""),
                        "status": label,
                        "start_date": (offer.get("startDate") or "")[:10],
                        "end_date": (offer.get("endDate") or "")[:10],
                        "original_price": orig_price,
                        "cover_url": cover,
                        "store_url": link,
                        "description": (el.get("description") or "")[:240],
                    })

    if items:
        with get_db() as conn:
            claimed_rows = conn.execute("SELECT title FROM epic_freebies WHERE claimed=1").fetchall()
            claimed_set = {normalize_title(r["title"]) for r in claimed_rows}
            conn.execute("DELETE FROM epic_freebies")
            for it in items:
                is_claimed = 1 if normalize_title(it["title"]) in claimed_set else 0
                conn.execute(
                    """
                    INSERT INTO epic_freebies(title, status, start_date, end_date, original_price, cover_url, store_url, description, claimed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        it["title"], it["status"], it["start_date"], it["end_date"],
                        it["original_price"], it["cover_url"], it["store_url"], it["description"], is_claimed,
                    ),
                )
    return items


# =====================================================================
# 5. CHEAPSHARK + ISTHEREANYDEAL v2 + GOG CATALOG (PREÇOS & MENOR HISTÓRICO)
# =====================================================================
async def _cheapshark_stores() -> Dict[str, str]:
    cached = cache_get("cs_stores")
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as client:
            r = await client.get("https://www.cheapshark.com/api/1.0/stores")
            if r.status_code != 200:
                return {}
            mp = {str(s["storeID"]): s["storeName"] for s in r.json()}
            cache_set("cs_stores", mp, 86400)
            return mp
    except Exception:
        return {}


async def fetch_cheapshark(title: str, steam_appid: Optional[int] = None) -> Optional[Dict[str, Any]]:
    ck = f"cs_{steam_appid or normalize_title(title)}"
    cached = cache_get(ck)
    if cached is not None:
        return cached

    params = {"limit": 10}
    if steam_appid:
        params["steamAppID"] = str(steam_appid)
    else:
        params["title"] = title
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
            r = await client.get("https://www.cheapshark.com/api/1.0/games", params=params)
            items = r.json() if r.status_code == 200 else []
            if not items and steam_appid and title:
                r = await client.get("https://www.cheapshark.com/api/1.0/games", params={"title": title, "limit": 10})
                items = r.json() if r.status_code == 200 else []
            if not items:
                return None
            best = max(items, key=lambda x: _sim(title, x.get("external", ""))) if title else items[0]
            dr = await client.get("https://www.cheapshark.com/api/1.0/games", params={"id": best["gameID"]})
            if dr.status_code != 200:
                return None
            d = dr.json()
            stores = await _cheapshark_stores()
            top = (d.get("deals") or [None])[0]
            low_usd = float((d.get("cheapestPriceEver") or {}).get("price")) if (d.get("cheapestPriceEver") or {}).get("price") else None
            cur_usd = float(top["price"]) if top and top.get("price") else None
            ret_usd = float(top["retailPrice"]) if top and top.get("retailPrice") else None
            out = {
                "current_price": _usd_to_local(cur_usd),
                "full_price": _usd_to_local(ret_usd),
                "historical_low": _usd_to_local(low_usd),
                "best_store": stores.get(str(top["storeID"]), "PC Store") if top else "",
                "deal_url": f"https://www.cheapshark.com/redirect?dealID={top['dealID']}" if top and top.get("dealID") else "",
            }
            cache_set(ck, out, 21600)
            return out
    except Exception:
        return None


async def fetch_itad(title: str, steam_appid: Optional[int] = None) -> Optional[Dict[str, Any]]:
    cfg = get_settings()
    key = (cfg.get("itad_api_key") or "").strip()
    if not key:
        return None
    cc = cfg.get("country", "BR")
    ck = f"itad_{cc}_{steam_appid or normalize_title(title)}"
    cached = cache_get(ck)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
            params = {"key": key}
            if steam_appid:
                params["appid"] = str(steam_appid)
            else:
                params["title"] = title
            lr = await client.get("https://api.isthereanydeal.com/games/lookup/v1", params=params)
            ld = lr.json() if lr.status_code == 200 else {}
            if not ld.get("found") or not (ld.get("game") or {}).get("id"):
                return None
            gid = ld["game"]["id"]
            or_res = await client.post(
                "https://api.isthereanydeal.com/games/overview/v2",
                params={"key": key, "country": cc, "vouchers": "true"},
                json=[gid],
            )
            if or_res.status_code != 200:
                return None
            prices = or_res.json().get("prices") or []
            if not prices:
                return None
            entry = prices[0]
            cur = entry.get("current") or {}
            low = entry.get("lowest") or {}
            out = {
                "current_price": (cur.get("price") or {}).get("amount"),
                "full_price": (cur.get("regular") or {}).get("amount"),
                "historical_low": (low.get("price") or {}).get("amount"),
                "best_store": (cur.get("shop") or {}).get("name") or "",
                "deal_url": cur.get("url") or "",
            }
            cache_set(ck, out, 21600)
            return out
    except Exception:
        return None


# =====================================================================
# 6. UNIFIED PARALLEL ENRICHMENT (RODA TUDO EM PARALELO EM ~1 SEGUNDO!)
# =====================================================================
async def fetch_unified_game(title: str, steam_appid: Optional[int] = None) -> Dict[str, Any]:
    resolved_appid = steam_appid
    if not resolved_appid and title:
        s_hits = await steam_search_games(title, limit=5)
        if s_hits:
            best_s = max(s_hits, key=lambda x: _sim(title, x["title"]))
            if _sim(title, best_s["title"]) >= 0.45:
                resolved_appid = best_s["steam_appid"]

    hltb, steam, proton, gp, itad, cs = await asyncio.gather(
        fetch_hltb(title),
        steam_get_app_details(resolved_appid) if resolved_appid else asyncio.sleep(0, result=None),
        fetch_protondb_tier(resolved_appid) if resolved_appid else asyncio.sleep(0, result=""),
        check_gamepass_status(title),
        fetch_itad(title, resolved_appid),
        fetch_cheapshark(title, resolved_appid),
    )

    # Melhor preço atual
    offers = []
    if itad and itad.get("current_price") is not None:
        offers.append((float(itad["current_price"]), itad["best_store"] or "ITAD", itad.get("deal_url", "")))
    if steam and steam.get("current_price") is not None:
        offers.append((float(steam["current_price"]), "Steam", steam.get("store_url", "")))
    if cs and cs.get("current_price") is not None:
        offers.append((float(cs["current_price"]), cs["best_store"] or "PC Store", cs.get("deal_url", "")))
    offers.sort(key=lambda x: x[0])

    lows = [x for x in [
        itad.get("historical_low") if itad else None,
        cs.get("historical_low") if cs else None,
        offers[0][0] if offers else None,
    ] if x is not None]

    return {
        "title": (steam or {}).get("title") or (hltb or {}).get("name") or title,
        "steam_appid": resolved_appid,
        "genre": (steam or {}).get("genre") or "",
        "release_year": (steam or {}).get("year") or (hltb or {}).get("year"),
        "critic_score": (steam or {}).get("metacritic") or (hltb or {}).get("review_score"),
        "hltb_main": (hltb or {}).get("main"),
        "hltb_extra": (hltb or {}).get("extra"),
        "hltb_comp": (hltb or {}).get("comp"),
        "hltb_url": (hltb or {}).get("url") or "",
        "protondb_tier": proton or "",
        "gamepass_status": gp,
        "cover_url": (steam or {}).get("cover_url") or (hltb or {}).get("cover_url") or "",
        "banner_url": (steam or {}).get("banner_url") or (hltb or {}).get("cover_url") or "",
        "full_price": (steam or {}).get("full_price") or (itad or {}).get("full_price") or (cs or {}).get("full_price"),
        "current_price": offers[0][0] if offers else None,
        "best_store": offers[0][1] if offers else "",
        "deal_url": offers[0][2] if offers else ((steam or {}).get("store_url") or ""),
        "historical_low": min(lows) if lows else None,
    }
