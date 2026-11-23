import json
import os
import re

OUT_DIR = os.path.join(os.path.dirname(__file__), "generated")
INFO_PATH = r"C:\Users\m.padovani\.gemini\antigravity\brain\c74c1f83-a80e-4c24-a066-a0d3d326a065\.system_generated\steps\138\output.txt"

# Extract JSON from info output
raw_txt = open(INFO_PATH, encoding="utf-8").read()
info = json.loads(raw_txt[raw_txt.index("{"):])
dash_charts = info["sheets"][0].get("charts", [])
chart2_id = None
for ch in dash_charts:
    if "Plataforma" in ch.get("spec", {}).get("title", ""):
        chart2_id = ch["chartId"]
print("Found Chart 2 ID:", chart2_id)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return {
        "red": int(h[0:2], 16) / 255.0,
        "green": int(h[2:4], 16) / 255.0,
        "blue": int(h[4:6], 16) / 255.0,
    }


def grid_range(sid, r1, r2, c1, c2):
    return {"sheetId": sid, "startRowIndex": r1, "endRowIndex": r2, "startColumnIndex": c1, "endColumnIndex": c2}


def repeat_cell(sid, r1, r2, c1, c2, fmt, fields=None):
    if fields is None:
        fields = ",".join(f"userEnteredFormat.{k}" for k in fmt.keys())
    return {"repeatCell": {"range": grid_range(sid, r1, r2, c1, c2), "cell": {"userEnteredFormat": fmt}, "fields": fields}}


def borders(sid, r1, r2, c1, c2, color="#CBD5E1"):
    b = {"style": "SOLID", "color": hex_to_rgb(color)}
    return {"updateBorders": {"range": grid_range(sid, r1, r2, c1, c2), "top": b, "bottom": b, "left": b, "right": b, "innerHorizontal": b, "innerVertical": b}}


def to_ptbr(val):
    if not isinstance(val, str) or not val.startswith("="):
        return val
    out, in_str, brace_depth = [], False, 0
    i, n = 0, len(val)
    while i < n:
        ch = val[i]
        if ch == '"':
            in_str = not in_str
            out.append(ch)
            i += 1
            continue
        if in_str:
            out.append(ch)
            i += 1
            continue
        if ch == "{":
            brace_depth += 1
            out.append(ch)
        elif ch == "}":
            brace_depth = max(0, brace_depth - 1)
            out.append(ch)
        elif ch == ",":
            if brace_depth > 0:
                sub = "".join(out)
                tail = sub[sub.rfind("{") + 1:]
                out.append(";" if (tail.count("(") - tail.count(")")) > 0 else "\\")
            else:
                out.append(";")
        elif ch == "." and i > 0 and i + 1 < n and val[i - 1].isdigit() and val[i + 1].isdigit():
            out.append(",")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


# =====================================================================
# 1. PC-FIRST VALUES (STEAM + EPIC GAMES + PC GAME PASS)
# =====================================================================
pc_games = [
    ("Elden Ring", "🏆 100% / Platina", "🔥 1 - Urgente", "PC", "Steam", "RPG de Ação", 2022, 60, 101, 134, 128.5, 1.0, 96, 10.0, 174.9, "🏆 Platinum", "2024-06-20", "2026-01-05", "2026-02-28", 1245620, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg", "Obra-prima absoluta. DLC Shadow of the Erdtree finalizada!"),
    ("Hollow Knight", "✅ Zerado", "⭐ 2 - Alta", "PC", "PC Game Pass", "Metroidvania", 2017, 27, 42, 64, 44.0, 0.78, 90, 9.5, 0.0, "✅ Verified", "2024-11-22", "2026-03-02", "2026-03-29", 367520, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/header.jpg", "Jogado via PC Game Pass. Falta só o Panteão de Hallownest."),
    ("Baldur's Gate 3", "🕹️ Jogando", "🔥 1 - Urgente", "PC", "Steam", "RPG de Ação", 2023, 68, 112, 165, 58.0, 0.42, 96, 9.8, 199.99, "✅ Verified", "2024-12-20", "2026-09-10", "", 1086940, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/header.jpg", "No meio do Ato 3 — história incrível."),
    ("Hades", "✅ Zerado", "⭐ 2 - Alta", "PC", "Steam", "Roguelike", 2020, 23, 49, 96, 52.0, 0.86, 93, 9.5, 29.59, "✅ Verified", "2024-03-10", "2026-04-04", "2026-05-01", 1145360, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg", "Viciante, trilha sonora impecável."),
    ("Cyberpunk 2077", "📌 Backlog", "🔥 1 - Urgente", "PC", "Steam", "RPG de Ação", 2020, 26, 63, 105, 4.5, 0.08, 86, "", 79.96, "🥇 Gold", "2025-06-28", "", "", 1091500, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg", "Edição Ultimate com Phantom Liberty."),
    ("Celeste", "✅ Zerado", "⭐ 2 - Alta", "PC", "Epic Games", "Plataforma", 2018, 8.5, 13, 39, 14.0, "", 94, 9.2, 0.0, "✅ Verified", "2023-08-15", "2026-05-10", "2026-05-21", 504230, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/504230/header.jpg", "Resgatado grátis na Epic Games Store!"),
    ("Persona 5 Royal", "⏸️ Pausado", "⭐ 2 - Alta", "PC", "PC Game Pass", "JRPG", 2022, 101, 123, 143, 38.0, 0.30, 95, "", 0.0, "✅ Verified", "2025-02-01", "2026-06-01", "", 1687950, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1687950/header.jpg", "Pausado no 4º palácio, retomar nas férias."),
    ("God of War Ragnarök", "📌 Backlog", "🔥 1 - Urgente", "PC", "Steam", "Aventura", 2024, 26.5, 41, 55, 0.0, 0.0, 94, "", 149.9, "🥇 Gold", "2025-11-28", "", "", 2322010, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2322010/header.jpg", "Comprado na Promoção de Outono da Steam."),
    ("Disco Elysium - The Final Cut", "📌 Backlog", "⭐ 2 - Alta", "PC", "Steam", "Indie", 2019, 23, 32, 47, 1.5, 0.05, 97, "", 18.87, "✅ Verified", "2024-07-04", "", "", 632470, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/632470/header.jpg", "Ótima opção narrativa p/ noites calmas."),
    ("DOOM Eternal", "✅ Zerado", "👍 3 - Média", "PC", "PC Game Pass", "FPS", 2020, 14.5, 21, 29, 18.5, 0.65, 88, 8.8, 0.0, "🥇 Gold", "2025-01-12", "2026-07-03", "2026-07-19", 782330, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/782330/header.jpg", "Adrenalina pura no PC Game Pass."),
    ("The Witcher 3: Wild Hunt", "📌 Backlog", "👍 3 - Média", "PC", "GOG", "Mundo Aberto", 2015, 51, 103, 173, 12.0, 0.14, 93, "", 39.99, "✅ Verified", "2023-12-22", "", "", 292030, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/header.jpg", "Complete Edition DRM-free."),
    ("Control Ultimate Edition", "✅ Zerado", "🔥 1 - Urgente", "PC", "Epic Games", "Aventura", 2020, 11.5, 22, 34, 21.0, "", 85, 9.1, 0.0, "✅ Verified", "2026-01-18", "2026-08-05", "2026-08-22", 870780, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/870780/header.jpg", "Resgatado grátis na Epic — combate telecinético excelente!"),
    ("A Short Hike", "📌 Backlog", "⭐ 2 - Alta", "PC", "Epic Games", "Indie", 2019, 1.5, 3, 4.5, 0.0, 0.0, 88, "", 0.0, "✅ Verified", "2025-03-15", "", "", 1055540, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1055540/header.jpg", "Perfeito para zerar em uma tarde! (Grátis Epic)"),
    ("Ori and the Will of the Wisps", "📌 Backlog", "⭐ 2 - Alta", "PC", "PC Game Pass", "Metroidvania", 2020, 12, 15.5, 18.5, 0.0, 0.0, 90, "", 0.0, "✅ Verified", "2025-07-10", "", "", 1057090, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1057090/header.jpg", "Disponível no PC Game Pass, duração ideal."),
    ("Balatro", "♾️ Contínuo / MP", "👍 3 - Média", "PC", "Steam", "Roguelike", 2024, 7.5, 41, 145, 34.0, 0.45, 90, 9.3, 40.49, "✅ Verified", "2026-02-14", "2026-02-14", "", 2379780, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2379780/header.jpg", "Impossível jogar só uma run."),
    ("Starfield", "💀 Dropado", "🧊 4 - Baixa", "PC", "PC Game Pass", "Mundo Aberto", 2023, 23, 70, 156, 11.0, 0.15, 83, 6.2, 0.0, "🥈 Silver", "2024-09-01", "2026-01-20", "", 1716740, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1716740/header.jpg", "Testado via PC Game Pass — economizei R$ 300!"),
]

backlog_data = []
for idx, g in enumerate(pc_games):
    r = idx + 3
    title, status, prio, plat, store, genre, year, hm, he, hc, played, ach, critic, mys, price, deck, bd, sd, ed, appid, cov, notes = g
    backlog_data.append([
        f'=IF(C{r}="","","G-"&TEXT(ROW()-2,"000"))',
        f'=IF(AC{r}="","",IMAGE(AC{r},1))',
        title, status, prio, plat, store, genre, year, hm, he, hc, played,
        f'=IF(C{r}="","",IF(OR(D{r}="✅ Zerado",D{r}="🏆 100% / Platina",D{r}="💀 Dropado",D{r}="♾️ Contínuo / MP"),0,MAX(0,IF(Config_APIs!$B$14=2,N(J{r}),IF(Config_APIs!$B$14=3,IF(N(L{r})>0,N(L{r}),N(K{r})),IF(N(K{r})>0,N(K{r}),N(J{r}))))-N(M{r}))))',
        f'=IF(C{r}="","",IF(OR(D{r}="✅ Zerado",D{r}="🏆 100% / Platina"),1,IF(D{r}="💀 Dropado",0,IF(IF(N(K{r})>0,N(K{r}),N(J{r}))>0,MIN(0.99,N(M{r})/IF(N(K{r})>0,N(K{r}),N(J{r}))),0))))',
        f'=IF(C{r}="","",SPARKLINE(O{r},{{"charttype","bar";"max",1;"color1",IF(O{r}>=1,"#10B981",IF(O{r}>=0.5,"#3B82F6","#F59E0B"))}}))',
        ach, critic, mys, price,
        f'=IF(C{r}="","",IF(N(T{r})=0,"Grátis",IF(N(M{r})>0,T{r}/M{r},IF(N(K{r})>0,T{r}/K{r},IF(N(J{r})>0,T{r}/J{r},"")))))',
        deck, bd, sd, ed,
        f'=IF(AND(ISNUMBER(X{r}),ISNUMBER(Y{r})),MAX(1,Y{r}-X{r}),"")',
        f'=IF(OR(C{r}="",AND(D{r}<>"📌 Backlog",D{r}<>"⏸️ Pausado")),"",ROUND(Config_APIs!$B$18*IF(E{r}="🔥 1 - Urgente",100,IF(E{r}="⭐ 2 - Alta",80,IF(E{r}="👍 3 - Média",55,IF(E{r}="🧊 4 - Baixa",30,IF(E{r}="💤 5 - Talvez",15,50)))))+Config_APIs!$B$19*IF(ISNUMBER(R{r}),R{r},75)+Config_APIs!$B$20*MAX(15,MIN(100,100-IF(N(K{r})>0,K{r},IF(N(J{r})>0,J{r},20))*0.9))+Config_APIs!$B$21*IF(ISNUMBER(W{r}),MIN(100,MAX(10,(TODAY()-W{r})/3.65)),50),1))',
        appid, cov,
        f'=IF(C{r}="","",HYPERLINK("https://howlongtobeat.com/?q="&ENCODEURL(C{r}),"⏱️ HLTB"))',
        notes,
    ])

# --- WISHLIST (20 cols A:T, adding Col N "No Game Pass?") ---
wl_rows = [
    ["🏷️ WISHLIST", "", "RADAR PC — STEAM, EPIC, CHEAPSHARK, ITAD & DETECTOR AUTOMÁTICO DE PC GAME PASS"] + [""] * 17,
    [
        "Capa", "Título", "Plataforma", "Hype", "Lançamento", "HLTB Est. (h)",
        "Nota Crítica", "Preço Cheio", "Preço Atual", "Desconto",
        "Menor Histórico", "Preço Alvo", "Melhor Loja", "No Game Pass?",
        "Sinal de Compra", "R$/Hora Est.", "Steam AppID", "Link Oferta",
        "Atualizado Em", "URL Capa"
    ],
]
pc_wishlist = [
    ("Hollow Knight: Silksong", "PC", "🔥 Day One", "2026-06-01", 35, 95, 119.9, 119.9, 119.9, 99.9, "Steam", "✅ No PC Game Pass", 1030300, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1030300/header.jpg"),
    ("Metaphor: ReFantazio", "PC", "⭐ Quero Muito", "2024-10-11", 85, 94, 299.9, 149.95, 149.95, 160.0, "Nuuvem", "Não", 2679460, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2679460/header.jpg"),
    ("Hades II", "PC", "🔥 Day One", "2025-09-25", 45, 94, 88.99, 71.19, 71.19, 75.0, "Steam", "Não", 1145350, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1145350/header.jpg"),
    ("Clair Obscur: Expedition 33", "PC", "⭐ Quero Muito", "2025-04-24", 40, 92, 199.0, 159.2, 149.0, 130.0, "Steam", "✅ No PC Game Pass", 1903340, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1903340/header.jpg"),
    ("Sekiro: Shadows Die Twice", "PC", "⭐ Quero Muito", "2019-03-22", 42, 90, 274.0, 137.0, 137.0, 120.0, "Steam", "Não", 814380, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/814380/header.jpg"),
    ("Outer Wilds", "PC", "👍 Em Promoção", "2020-06-18", 22, 85, 67.99, 27.19, 27.19, 35.0, "Steam", "Não", 753640, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/753640/header.jpg"),
]
for idx, w in enumerate(pc_wishlist):
    r = idx + 3
    t, p, h, rel, hltb, cr, fp, cp, lp, tp, shop, gp, appid, upd, cov = w
    wl_rows.append([
        f'=IF(T{r}="","",IMAGE(T{r},1))', t, p, h, rel, hltb, cr, fp, cp,
        f'=IF(AND(ISNUMBER(H{r}),H{r}>0,ISNUMBER(I{r})),MAX(0,(H{r}-I{r})/H{r}),"")',
        lp, tp, shop, gp,
        f'=IF(B{r}="","",IF(LEFT(N{r},1)="✅","🎮 JÁ NO GAME PASS!",IF(AND(ISNUMBER(I{r}),ISNUMBER(L{r}),I{r}<=L{r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I{r}),ISNUMBER(K{r}),K{r}>0,I{r}<=K{r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J{r}),J{r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar")))))',
        f'=IF(AND(ISNUMBER(I{r}),ISNUMBER(F{r}),F{r}>0),I{r}/F{r},"")',
        appid,
        f'=IF(B{r}="","",IF(Q{r}<>"",HYPERLINK("https://store.steampowered.com/app/"&Q{r},"🛒 Steam"),HYPERLINK("https://isthereanydeal.com/search/?q="&ENCODEURL(B{r}),"🔎 ITAD")))',
        upd, cov
    ])
for r in range(len(pc_wishlist) + 3, 61):
    wl_rows.append([
        f'=IF(T{r}="","",IMAGE(T{r},1))', "", "", "", "", "", "", "", "",
        f'=IF(AND(ISNUMBER(H{r}),H{r}>0,ISNUMBER(I{r})),MAX(0,(H{r}-I{r})/H{r}),"")',
        "", "", "", "",
        f'=IF(B{r}="","",IF(LEFT(N{r},1)="✅","🎮 JÁ NO GAME PASS!",IF(AND(ISNUMBER(I{r}),ISNUMBER(L{r}),I{r}<=L{r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I{r}),ISNUMBER(K{r}),K{r}>0,I{r}<=K{r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J{r}),J{r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar")))))',
        f'=IF(AND(ISNUMBER(I{r}),ISNUMBER(F{r}),F{r}>0),I{r}/F{r},"")',
        "",
        f'=IF(B{r}="","",IF(Q{r}<>"",HYPERLINK("https://store.steampowered.com/app/"&Q{r},"🛒 Steam"),HYPERLINK("https://isthereanydeal.com/search/?q="&ENCODEURL(B{r}),"🔎 ITAD")))',
        "", ""
    ])

# --- SESSOES (update RE4 -> Control Ultimate Edition to match Backlog) ---
sess_patch = [["2026-08-22", "Control Ultimate Edition", '=IF(B9="","",IFERROR(INDEX(Backlog!$F$3:$F$500,MATCH(B9,Backlog!$C$3:$C$500,0)),""))', 4.5, 5, "✅ Zerado", '=IF(ISNUMBER(A9),MONTH(A9),"")', '=IF(ISNUMBER(A9),YEAR(A9),"")', '=IF(ISNUMBER(A9),TEXT(A9,"mm/yyyy"),"")', "Finalizado via Epic Games Store — ótimo combate!"]]

# --- GRATIS_ASSINATURAS (PC Game Pass ROI + Epic Freebies + Game Pass Leaving Soon!) ---
gratis_rows = [
    ["🎁 PC GAME PASS (ROI + SAINDO EM BREVE) & JOGOS GRÁTIS DA EPIC GAMES STORE"] + [""] * 7,
    ["Acompanhe o retorno do seu PC Game Pass, receba alertas dos jogos saindo do catálogo e resgate os jogos grátis semanais da Epic Games.", "", "", "", "", "", "", ""],
    ["💳 1. CONTROLE DE ASSINATURAS PC — VALE A PENA?", "", "", "", "", "", "", ""],
    ["Assinatura", "Tag na Loja (Backlog)", "Mensalidade (R$)", "Custo Anual (R$)", "Jogos no Acervo", "Zerados", "Horas Jogadas", "Custo / Hora (R$)"],
    ["PC Game Pass", "PC Game Pass", 35.99, "=C5*12", '=COUNTIF(Backlog!$G$3:$G$500,B5)', '=COUNTIFS(Backlog!$G$3:$G$500,B5,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B5,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B5,Backlog!$M$3:$M$500)', '=IF(G5>0,D5/G5,"Sem horas")'],
    ["Amazon Prime Gaming", "Amazon Prime", 19.90, "=C6*12", '=COUNTIF(Backlog!$G$3:$G$500,B6)', '=COUNTIFS(Backlog!$G$3:$G$500,B6,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B6,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B6,Backlog!$M$3:$M$500)', '=IF(G6>0,D6/G6,"Sem horas")'],
    ["Humble Choice (Opcional)", "Humble Bundle", 0.00, "=C7*12", '=COUNTIF(Backlog!$G$3:$G$500,B7)', '=COUNTIFS(Backlog!$G$3:$G$500,B7,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B7,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B7,Backlog!$M$3:$M$500)', '=IF(G7>0,D7/G7,"Sem horas")'],
    ["EA Play / Ubisoft+ (Opcional)", "EA Play", 0.00, "=C8*12", '=COUNTIF(Backlog!$G$3:$G$500,B8)', '=COUNTIFS(Backlog!$G$3:$G$500,B8,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B8,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B8,Backlog!$M$3:$M$500)', '=IF(G8>0,D8/G8,"Sem horas")'],
    ["TOTAL ASSINATURAS", "", "=SUM(C5:C8)", "=SUM(D5:D8)", "=SUM(E5:E8)", "=SUM(F5:F8)", "=SUM(G5:G8)", '=IF(G9>0,D9/G9,"—")'],
    ["", "", "", "", "", "", "", ""],
    ["🎁 2. JOGOS GRÁTIS DA SEMANA — EPIC GAMES STORE (MENU 🎮 BACKLOG MASTER > BUSCAR GRÁTIS DA EPIC)", "", "", "", "", "", "", ""],
    ["Título do Jogo", "Status", "Disponível De", "Disponível Até", "Preço Original", "Resgatado?", "Link Epic Store", "Descrição"],
    ["(Clique em 🎮 Backlog Master > 🎁 Buscar Jogos Grátis da Epic para atualizar ao vivo)", "🟡 Aguardando Sync", "", "", "", False, '=HYPERLINK("https://store.epicgames.com/pt-BR/free-games","🎁 Abrir Epic Grátis")', "API pública oficial da Epic (sem chave) — lista jogos gratuitos desta semana e da próxima!"],
]
# Rows 14..23 blank, Row 24 Section 3, Row 25 Header, Row 26 placeholder
for _ in range(10):
    gratis_rows.append(["", "", "", "", "", "", "", ""])
gratis_rows += [
    ["🚨 3. PC GAME PASS — SAINDO EM BREVE (MENU 🎮 BACKLOG MASTER > CHECAR SAINDO DO GAME PASS)", "", "", "", "", "", "", ""],
    ["Título do Jogo", "Alerta", "Publisher", "Está no Seu Backlog?", "HLTB (h)", "Joguei?", "Link Xbox/PC", "Observação"],
    ["(Clique em 🎮 Backlog Master > 🚨 Checar \"Saindo em Breve\" no PC Game Pass)", "🟡 Aguardando Sync", "Microsoft Store API", '=IF(COUNTIF(Backlog!$C$3:$C$500,"*"&A26&"*")>0,"⚠️ NO SEU BACKLOG!","Catálogo Game Pass")', "", False, '=HYPERLINK("https://www.xbox.com/pt-BR/xbox-game-pass/games","🎮 Ver Catálogo PC")', "API pública oficial da Microsoft (sem chave) — alerta automaticamente se algum jogo da sua fila vai sair!"],
]

# --- ANALISES: Update Store Table (Table 6) so top PC stores are rows 30..37 ---
pc_stores = ["Steam", "Epic Games", "PC Game Pass", "GOG", "Amazon Prime", "EA Play", "Humble Bundle", "Ubisoft", "Battle.net", "Xbox Store", "PlayStation Store", "Outro"]
stores_patch = []
for idx, s in enumerate(pc_stores):
    r = 30 + idx
    stores_patch.append([
        s,
        f'=COUNTIF(Backlog!$G$3:$G$500,H{r})',
        f'=COUNTIFS(Backlog!$G$3:$G$500,H{r},Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,H{r},Backlog!$D$3:$D$500,"🏆 100% / Platina")',
        f'=SUMIF(Backlog!$G$3:$G$500,H{r},Backlog!$M$3:$M$500)',
        f'=SUMIF(Backlog!$G$3:$G$500,H{r},Backlog!$T$3:$T$500)',
        f'=IF(I{r}>0,L{r}/I{r},0)',
    ])

# --- DASHBOARD: Update Wishlist Radar (now Col O is Sinal de Compra & adds Game Pass alert!) & Top 5 shows Loja instead of Plataforma! ---
dash_radar_patch = [
    ["Jogos na Wishlist", "", "", "=COUNTA(Wishlist!B3:B300)", ""],
    ["🎮 Já no PC Game Pass!", "", "", '=COUNTIF(Wishlist!O3:O300,"🎮 JÁ NO GAME PASS!")', ""],
    ["🎯 Prontos p/ Comprar (≤ Alvo)", "", "", '=COUNTIF(Wishlist!O3:O300,"🎯 COMPRAR AGORA!")', ""],
    ["Custo Atual da Wishlist", "", "", "=SUM(Wishlist!I3:I300)", ""],
    ["Economia Atual vs Cheio", "", "", "=MAX(0,SUM(Wishlist!H3:H300)-SUM(Wishlist!I3:I300))", ""],
]
dash_top5_header = [["#", "Título", "Loja", "Prioridade", "HLTB (h)", "Crítica", "Score"]]
dash_top5_formula = [['=IFERROR(SORTN(FILTER(HSTACK(Backlog!C3:C500,Backlog!G3:G500,Backlog!E3:E500,Backlog!K3:K500,Backlog!R3:R500,Backlog!AA3:AA500),ISNUMBER(Backlog!AA3:AA500)),5,0,6,FALSE),"Adicione jogos com status 📌 Backlog!")']]

# --- CONFIG_APIS: Add PC Game Pass row at row 37 ---
config_gp_row = [["PC Game Pass Catalog API (Microsoft)", "AUTOMÁTICO", "Não", "Checa se jogos da Wishlist estão no Game Pass e lista jogos 'Saindo em Breve'", "catalog.gamepass.com", "✅ Pronto (Sem Chave)"]]

# --- GUIA_FUNCOES: Add GAMEPASS_CHECK formula & Steam Wishlist note ---
guia_gp_row = [["GAMEPASS_CHECK", '\'=GAMEPASS_CHECK("Hollow Knight")', "PC Game Pass API", "Não", "Verifica se o jogo está incluso no PC Game Pass (ou saindo em breve!)", "✅ No PC Game Pass"]]

batch_ops = [
    {"op": "write", "range": "Backlog!A3:AE18", "data": backlog_data},
    {"op": "write", "range": "Wishlist!A1:T60", "data": wl_rows},
    {"op": "write", "range": "Sessoes!A9:J9", "data": sess_patch},
    {"op": "write", "range": "Gratis_Assinaturas!A1:H26", "data": gratis_rows},
    {"op": "write", "range": "Analises!H30:M41", "data": stores_patch},
    {"op": "write", "range": "Dashboard!H9:L13", "data": dash_radar_patch},
    {"op": "write", "range": "Dashboard!A16:G16", "data": dash_top5_header},
    {"op": "write", "range": "Dashboard!B17:B17", "data": dash_top5_formula},
    {"op": "write", "range": "Config_APIs!A37:F37", "data": config_gp_row},
    {"op": "write", "range": "Guia_Funcoes!A29:F29", "data": guia_gp_row},
]

# Localize all formulas to pt_BR
for op in batch_ops:
    op["data"] = [[to_ptbr(c) for c in row] for row in op["data"]]

with open(os.path.join(OUT_DIR, "07_pc_values.json"), "w", encoding="utf-8") as f:
    json.dump(batch_ops, f, ensure_ascii=False, indent=2)

# =====================================================================
# 2. STYLE, VALIDATIONS, CONDITIONAL RULES & CHART 2 UPDATE
# =====================================================================
reqs = [
    # Update Backlog dropdowns to PC-first order
    {
        "setDataValidation": {
            "range": grid_range(10, 2, 500, 5, 6),
            "rule": {"condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": v} for v in ["PC", "Steam Deck", "PC (Cloud / xCloud)", "PS5", "Xbox Series", "Nintendo Switch", "Mobile", "Retro / Emulador"]]}, "showCustomUi": True, "strict": False},
        }
    },
    {
        "setDataValidation": {
            "range": grid_range(10, 2, 500, 6, 7),
            "rule": {"condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": v} for v in pc_stores]}, "showCustomUi": True, "strict": False},
        }
    },
    # Wishlist 20th col styling (Col T = URL Capa, Col N = No Game Pass?, Col O = Sinal de Compra)
    {"unmergeCells": {"range": grid_range(20, 0, 1, 2, 19)}},
    {"mergeCells": {"range": grid_range(20, 0, 1, 2, 20), "mergeType": "MERGE_ALL"}},
    repeat_cell(20, 0, 1, 19, 20, {"backgroundColor": hex_to_rgb("#9D174D")}, "userEnteredFormat.backgroundColor"),
    repeat_cell(20, 1, 2, 0, 20, {
        "backgroundColor": hex_to_rgb("#9D174D"),
        "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#F8FAFC")},
        "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE", "wrapStrategy": "WRAP",
    }),
    repeat_cell(20, 2, 60, 13, 15, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 15, 16, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 16, 19, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 16, 17, {"numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 18, 19, {"numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}, "userEnteredFormat.numberFormat"),
    borders(20, 1, 60, 0, 20, "#FBCFE8"),
    # Set crisp column widths for Wishlist A..T
    *[
        {"updateDimensionProperties": {"range": {"sheetId": 20, "dimension": "COLUMNS", "startIndex": i, "endIndex": i + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}}
        for i, w in enumerate([100, 215, 78, 120, 92, 82, 76, 94, 94, 74, 100, 94, 98, 145, 155, 86, 86, 86, 96, 120])
    ],
    # Conditional formatting on Wishlist Col N (No Game Pass?) and Col O (Sinal de Compra)
    {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(20, 2, 300, 13, 14)],
                "booleanRule": {
                    "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "Game Pass"}]},
                    "format": {"backgroundColor": hex_to_rgb("#D1FAE5"), "textFormat": {"foregroundColor": hex_to_rgb("#047857"), "bold": True}},
                },
            },
            "index": 0,
        }
    },
    {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(20, 2, 300, 14, 15)],
                "booleanRule": {
                    "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "🎮 JÁ NO GAME PASS!"}]},
                    "format": {"backgroundColor": hex_to_rgb("#A7F3D0"), "textFormat": {"foregroundColor": hex_to_rgb("#065F46"), "bold": True}},
                },
            },
            "index": 0,
        }
    },
    {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(20, 2, 300, 14, 15)],
                "booleanRule": {
                    "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "🎯 COMPRAR AGORA!"}]},
                    "format": {"backgroundColor": hex_to_rgb("#D1FAE5"), "textFormat": {"foregroundColor": hex_to_rgb("#047857"), "bold": True}},
                },
            },
            "index": 1,
        }
    },
    {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(20, 2, 300, 14, 15)],
                "booleanRule": {
                    "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": "🔥 MENOR HISTÓRICO"}]},
                    "format": {"backgroundColor": hex_to_rgb("#FEF3C7"), "textFormat": {"foregroundColor": hex_to_rgb("#B45309"), "bold": True}},
                },
            },
            "index": 2,
        }
    },
    # Gratis_Assinaturas Section 3 (PC Game Pass Leaving Soon - rows 24..46, 0-indexed 23..45)
    {"mergeCells": {"range": grid_range(40, 23, 24, 0, 8), "mergeType": "MERGE_ALL"}},
    {"updateDimensionProperties": {"range": {"sheetId": 40, "dimension": "ROWS", "startIndex": 23, "endIndex": 24}, "properties": {"pixelSize": 30}, "fields": "pixelSize"}},
    {"updateDimensionProperties": {"range": {"sheetId": 40, "dimension": "ROWS", "startIndex": 24, "endIndex": 25}, "properties": {"pixelSize": 32}, "fields": "pixelSize"}},
    {"updateDimensionProperties": {"range": {"sheetId": 40, "dimension": "ROWS", "startIndex": 25, "endIndex": 45}, "properties": {"pixelSize": 40}, "fields": "pixelSize"}},
    repeat_cell(40, 23, 24, 0, 8, {
        "backgroundColor": hex_to_rgb("#065F46"),
        "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#FFFFFF")},
        "horizontalAlignment": "LEFT", "verticalAlignment": "MIDDLE", "padding": {"left": 10},
    }),
    repeat_cell(40, 24, 25, 0, 8, {
        "backgroundColor": hex_to_rgb("#1E293B"),
        "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#F8FAFC")},
        "horizontalAlignment": "CENTER", "verticalAlignment": "MIDDLE", "wrapStrategy": "WRAP",
    }),
    repeat_cell(40, 25, 45, 0, 8, {"wrapStrategy": "WRAP", "verticalAlignment": "MIDDLE"}, "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment"),
    borders(40, 24, 45, 0, 8, "#A7F3D0"),
    {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(40, 25, 45, 3, 4)],
                "booleanRule": {
                    "condition": {"type": "TEXT_CONTAINS", "values": [{"userEnteredValue": "BACKLOG"}]},
                    "format": {"backgroundColor": hex_to_rgb("#FEE2E2"), "textFormat": {"foregroundColor": hex_to_rgb("#B91C1C"), "bold": True}},
                },
            },
            "index": 0,
        }
    },
    # Style Config_APIs row 37 (idx 36)
    {"updateDimensionProperties": {"range": {"sheetId": 60, "dimension": "ROWS", "startIndex": 36, "endIndex": 37}, "properties": {"pixelSize": 36}, "fields": "pixelSize"}},
    repeat_cell(60, 36, 37, 0, 1, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}, "userEnteredFormat.textFormat"),
    repeat_cell(60, 36, 37, 1, 2, {"backgroundColor": hex_to_rgb("#ECFDF5"), "horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#047857")}}),
    repeat_cell(60, 36, 37, 2, 6, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
    repeat_cell(60, 36, 37, 5, 6, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    borders(60, 36, 37, 0, 6, "#CBD5E1"),
    # Style Guia_Funcoes row 29 (idx 28)
    {"updateDimensionProperties": {"range": {"sheetId": 70, "dimension": "ROWS", "startIndex": 28, "endIndex": 29}, "properties": {"pixelSize": 34}, "fields": "pixelSize"}},
    repeat_cell(70, 28, 29, 0, 1, {"textFormat": {"fontFamily": "Roboto Mono", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#4338CA")}}, "userEnteredFormat.textFormat"),
    repeat_cell(70, 28, 29, 1, 2, {"textFormat": {"fontFamily": "Roboto Mono", "fontSize": 9, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.textFormat"),
    repeat_cell(70, 28, 29, 2, 4, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(70, 28, 29, 1, 6, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
    borders(70, 28, 29, 0, 6, "#CBD5E1"),
]

# Update Chart 2 on Dashboard to show "Acervo vs. Zerados por Loja / Launcher" (Analises H29:J38 -> idx 28..38, domain col 7, series cols 8 & 9)!
if chart2_id is not None:
    reqs.append({
        "updateChartSpec": {
            "chartId": chart2_id,
            "spec": {
                "title": "Acervo vs. Zerados por Loja (Steam / Epic / Game Pass)",
                "titleTextFormat": {"fontFamily": "Inter", "fontSize": 12, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")},
                "backgroundColor": hex_to_rgb("#FFFFFF"),
                "basicChart": {
                    "chartType": "COLUMN",
                    "legendPosition": "TOP_LEGEND",
                    "stackedType": "NOT_STACKED",
                    "headerCount": 1,
                    "domains": [{"domain": {"sourceRange": {"sources": [grid_range(50, 28, 37, 7, 8)]}}}],
                    "series": [
                        {"series": {"sourceRange": {"sources": [grid_range(50, 28, 37, 8, 9)]}}, "color": hex_to_rgb("#0EA5E9"), "targetAxis": "LEFT_AXIS"},
                        {"series": {"sourceRange": {"sources": [grid_range(50, 28, 37, 9, 10)]}}, "color": hex_to_rgb("#10B981"), "targetAxis": "LEFT_AXIS"},
                    ],
                },
            },
        }
    })

with open(os.path.join(OUT_DIR, "08_pc_style.json"), "w", encoding="utf-8") as f:
    json.dump({"requests": reqs}, f, ensure_ascii=False, indent=2)

print("Generated 07_pc_values.json and 08_pc_style.json OK!")
