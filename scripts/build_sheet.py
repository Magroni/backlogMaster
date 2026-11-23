import json
import os

SPREADSHEET_ID = "1nqQRG5geyJg57VJiWOI1dahKWVvDCxvdRN4G6fttgOE"
OUT_DIR = os.path.join(os.path.dirname(__file__), "generated")
os.makedirs(OUT_DIR, exist_ok=True)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return {
        "red": int(h[0:2], 16) / 255.0,
        "green": int(h[2:4], 16) / 255.0,
        "blue": int(h[4:6], 16) / 255.0,
    }


def grid_range(sheet_id, r1, r2, c1, c2):
    return {
        "sheetId": sheet_id,
        "startRowIndex": r1,
        "endRowIndex": r2,
        "startColumnIndex": c1,
        "endColumnIndex": c2,
    }


def repeat_cell(sheet_id, r1, r2, c1, c2, fmt, fields=None):
    if fields is None:
        fields = ",".join(f"userEnteredFormat.{k}" for k in fmt.keys())
    return {
        "repeatCell": {
            "range": grid_range(sheet_id, r1, r2, c1, c2),
            "cell": {"userEnteredFormat": fmt},
            "fields": fields,
        }
    }


def merge_cells(sheet_id, r1, r2, c1, c2):
    return {
        "mergeCells": {
            "range": grid_range(sheet_id, r1, r2, c1, c2),
            "mergeType": "MERGE_ALL",
        }
    }


def col_width(sheet_id, c1, c2, px):
    return {
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "COLUMNS",
                "startIndex": c1,
                "endIndex": c2,
            },
            "properties": {"pixelSize": px},
            "fields": "pixelSize",
        }
    }


def row_height(sheet_id, r1, r2, px):
    return {
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": r1,
                "endIndex": r2,
            },
            "properties": {"pixelSize": px},
            "fields": "pixelSize",
        }
    }


def borders(sheet_id, r1, r2, c1, c2, color="#CBD5E1", style="SOLID", inner=True, outer=True):
    b = {"style": style, "color": hex_to_rgb(color)}
    req = {"range": grid_range(sheet_id, r1, r2, c1, c2)}
    if outer:
        req["top"] = b
        req["bottom"] = b
        req["left"] = b
        req["right"] = b
    if inner:
        req["innerHorizontal"] = b
        req["innerVertical"] = b
    return {"updateBorders": req}


def validation_list(sheet_id, r1, r2, c1, c2, values, strict=False):
    return {
        "setDataValidation": {
            "range": grid_range(sheet_id, r1, r2, c1, c2),
            "rule": {
                "condition": {
                    "type": "ONE_OF_LIST",
                    "values": [{"userEnteredValue": v} for v in values],
                },
                "showCustomUi": True,
                "strict": strict,
            },
        }
    }


def validation_range(sheet_id, r1, r2, c1, c2, formula_range):
    return {
        "setDataValidation": {
            "range": grid_range(sheet_id, r1, r2, c1, c2),
            "rule": {
                "condition": {
                    "type": "ONE_OF_RANGE",
                    "values": [{"userEnteredValue": formula_range}],
                },
                "showCustomUi": True,
                "strict": False,
            },
        }
    }


def validation_checkbox(sheet_id, r1, r2, c1, c2):
    return {
        "setDataValidation": {
            "range": grid_range(sheet_id, r1, r2, c1, c2),
            "rule": {
                "condition": {"type": "BOOLEAN"},
                "showCustomUi": True,
            },
        }
    }


def cond_eq(sheet_id, r1, r2, c1, c2, text, bg, fg, bold=True):
    return {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(sheet_id, r1, r2, c1, c2)],
                "booleanRule": {
                    "condition": {
                        "type": "TEXT_EQ",
                        "values": [{"userEnteredValue": text}],
                    },
                    "format": {
                        "backgroundColor": hex_to_rgb(bg),
                        "textFormat": {
                            "foregroundColor": hex_to_rgb(fg),
                            "bold": bold,
                        },
                    },
                },
            },
            "index": 0,
        }
    }


def cond_num(sheet_id, r1, r2, c1, c2, ctype, vals, bg, fg, bold=True):
    return {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [grid_range(sheet_id, r1, r2, c1, c2)],
                "booleanRule": {
                    "condition": {
                        "type": ctype,
                        "values": [{"userEnteredValue": str(v)} for v in vals],
                    },
                    "format": {
                        "backgroundColor": hex_to_rgb(bg),
                        "textFormat": {
                            "foregroundColor": hex_to_rgb(fg),
                            "bold": bold,
                        },
                    },
                },
            },
            "index": 0,
        }
    }


# =====================================================================
# 1. SETUP STRUCTURE (TABS, GRID SIZES, TIMEZONE, TAB COLORS, FREEZES)
# =====================================================================
SHEET_DEFS = [
    (0, "Dashboard", 65, 13, "#4F46E5", 0, 0, False),
    (10, "Backlog", 500, 32, "#0EA5E9", 2, 3, True),
    (20, "Wishlist", 300, 20, "#EC4899", 2, 2, True),
    (30, "Sessoes", 500, 11, "#10B981", 2, 0, True),
    (40, "Gratis_Assinaturas", 150, 10, "#F59E0B", 2, 0, True),
    (50, "Analises", 100, 14, "#8B5CF6", 2, 0, True),
    (60, "Config_APIs", 80, 7, "#64748B", 2, 0, True),
    (70, "Guia_Funcoes", 80, 7, "#14B8A6", 2, 0, True),
]

setup_requests = [
    {
        "updateSpreadsheetProperties": {
            "properties": {
                "title": "🎮 Game Backlog Master — Tracker Completo",
                "locale": "pt_BR",
                "timeZone": "America/Sao_Paulo",
            },
            "fields": "title,locale,timeZone",
        }
    }
]

for sid, title, rows, cols, color, fr_r, fr_c, show_grid in SHEET_DEFS:
    props = {
        "sheetId": sid,
        "title": title,
        "tabColor": hex_to_rgb(color),
        "gridProperties": {
            "rowCount": rows,
            "columnCount": cols,
            "frozenRowCount": fr_r,
            "frozenColumnCount": fr_c,
            "hideGridlines": not show_grid,
        },
    }
    if sid == 0:
        setup_requests.append(
            {
                "updateSheetProperties": {
                    "properties": props,
                    "fields": "title,tabColor,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines",
                }
            }
        )
    else:
        setup_requests.append({"addSheet": {"properties": props}})

with open(os.path.join(OUT_DIR, "01_setup.json"), "w", encoding="utf-8") as f:
    json.dump({"requests": setup_requests}, f, ensure_ascii=False, indent=2)


# =====================================================================
# 2. DATA & FORMULAS FOR ALL 8 TABS
# =====================================================================
batch_ops = []

# --- CONFIG_APIS ---
config_rows = [
    ["⚙️ CONFIGURAÇÕES, METAS & CHAVES DE API", "", "", "", "", ""],
    ["Configure suas metas pessoais e chaves de API (opcionais). HowLongToBeat, Steam Store, CheapShark, ProtonDB, GOG e Epic já funcionam SEM chave!", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["🎯 1. PERFIL, METAS & REGIÃO", "", "", "", "", ""],
    ["Parâmetro", "Valor", "Formato / Opções", "Descrição", "Referência", "Status"],
    ["Meta de Jogos Zerados no Ano", 20, "Número inteiro", "Quantos jogos você quer zerar no ano de referência", "Usado no Dashboard", "✅ Ativo"],
    ["Horas Disponíveis por Semana", 12, "Horas / semana", "Ritmo semanal para estimar quanto tempo falta p/ zerar o Backlog", "Usado no Dashboard", "✅ Ativo"],
    ["Ano de Referência", 2026, "AAAA", "Ano analisado nas metas anuais e na evolução mensal", "Usado em Análises", "✅ Ativo"],
    ["País / Região das Lojas", "BR", "BR, US, PT, AR...", "País usado para preços na Steam, Epic e IsThereAnyDeal", "Código ISO-2", "✅ Ativo"],
    ["Moeda Principal", "BRL", "BRL, USD, EUR", "Moeda de exibição nas planilhas e alertas", "ISO 4217", "✅ Ativo"],
    ["Cotação USD → BRL (Fallback)", 5.8, "Número decimal", "Conversão automática p/ APIs que retornam preços em USD (CheapShark)", "Atualize quando quiser", "✅ Ativo"],
    ["E-mail para Alertas de Promoção", "", "seu@email.com", "Recebe e-mail automático quando jogos da Wishlist atingem o Preço Alvo", "Menu > Automação Diária", "=IF(B12=\"\",\"⚪ Opcional\",\"✅ Configurado\")"],
    ["Importar Gratuitos (F2P) na Steam", "SIM", "SIM / NÃO", "Define se jogos Free-to-Play jogados entram na importação Steam", "Steam Web API", "✅ Ativo"],
    ["Modo HLTB p/ Estimativa Restante", 1, "1=Extra | 2=Main | 3=100%", "Define qual coluna do HowLongToBeat calcula as horas restantes do backlog", "1 recomendado", "✅ Ativo"],
    ["", "", "", "", "", ""],
    ["🧠 2. PESOS DO ALGORITMO \"PRÓXIMO JOGO\" (SOMA RECOMENDADA = 100%)", "", "", "", "", ""],
    ["Fator de Decisão", "Peso", "Soma Atual", "Como influencia o Score (0 a 100)", "Faixa", "Validação"],
    ["Prioridade Pessoal (1 a 5)", 0.4, "=SUM(B18:B21)", "Prioriza jogos marcados como Urgente (100) ou Alta (80)", "0% a 100%", "=IF(ROUND(SUM(B18:B21),2)=1,\"✅ Soma = 100%\",\"⚠️ Ajuste p/ somar 100%\")"],
    ["Nota Crítica (Metacritic / Steam)", 0.3, "", "Favorece jogos mais bem avaliados pela crítica e jogadores", "0% a 100%", ""],
    ["Rapidez HLTB (Quick Wins)", 0.2, "", "Favorece jogos mais curtos para destravar e diminuir o backlog", "0% a 100%", ""],
    ["Tempo na Fila (Antiguidade)", 0.1, "", "Favorece jogos comprados há mais tempo que estão parados", "0% a 100%", ""],
    ["", "", "", "", "", ""],
    ["🔑 3. INTEGRAÇÕES & CHAVES DE API (APENAS AS OPCIONAIS PRECISAM DE CHAVE)", "", "", "", "", ""],
    ["API / Serviço", "Chave / Valor", "Requer Chave?", "O que desbloqueia na planilha", "Onde obter (Grátis)", "Status"],
    ["Steam Web API Key", "", "Sim (Grátis)", "Importa sua biblioteca inteira da Steam, horas jogadas e % de conquistas", "=HYPERLINK(\"https://steamcommunity.com/dev/apikey\",\"🔗 Gerar Steam API Key\")", "=IF(B25=\"\",\"⚪ Não configurada\",\"✅ Configurada\")"],
    ["SteamID64 (17 dígitos)", "", "Sim (Público)", "Identifica sua conta Steam (mantenha Detalhes de Jogos como Público)", "=HYPERLINK(\"https://steamid.io/\",\"🔗 Descobrir SteamID64\")", "=IF(B26=\"\",\"⚪ Não configurada\",\"✅ Configurada\")"],
    ["RAWG.io API Key", "", "Opcional (Grátis)", "Capas, Metacritic, gêneros e datas p/ PS5, Switch, Xbox, Retro e PC", "=HYPERLINK(\"https://rawg.io/apidocs\",\"🔗 Gerar RAWG Key\")", "=IF(B27=\"\",\"⚪ Opcional\",\"✅ Configurada\")"],
    ["IGDB Client ID (Twitch)", "", "Opcional (Grátis)", "Catálogo definitivo multi-plataforma + notas agregadas (via Twitch)", "=HYPERLINK(\"https://dev.twitch.tv/console\",\"🔗 Twitch Console\")", "=IF(B28=\"\",\"⚪ Opcional\",\"✅ Configurada\")"],
    ["IGDB Client Secret (Twitch)", "", "Opcional (Grátis)", "Par do Client ID — renova o token OAuth2 automaticamente no Apps Script", "=HYPERLINK(\"https://dev.twitch.tv/console\",\"🔗 Twitch Console\")", "=IF(B29=\"\",\"⚪ Opcional\",\"✅ Configurada\")"],
    ["IsThereAnyDeal (ITAD) API Key", "", "Opcional (Grátis)", "Menor histórico e preços em R$ em Steam, Nuuvem, GOG, Epic, GMG, Humble", "=HYPERLINK(\"https://isthereanydeal.com/apps/my/\",\"🔗 Gerar ITAD Key\")", "=IF(B30=\"\",\"⚪ Opcional\",\"✅ Configurada\")"],
    ["HLTB Endpoint Override", "", "Não (Auto)", "Deixe em branco! O script descobre o endpoint dinâmico + x-auth-token sozinho", "=HYPERLINK(\"https://howlongtobeat.com\",\"🔗 HowLongToBeat\")", "=IF(B31=\"\",\"✅ Descoberta Automática\",\"🔧 Customizado\")"],
    ["HowLongToBeat (HLTB)", "AUTOMÁTICO", "Não", "Tempos Main, Main+Extra, 100%, capa e link direto do jogo", "Integrado no Apps Script", "✅ Pronto (Sem Chave)"],
    ["Steam Store API (BR)", "AUTOMÁTICO", "Não", "Busca Steam AppID, preço atual em R$, desconto, Metacritic, gêneros e capa", "store.steampowered.com", "✅ Pronto (Sem Chave)"],
    ["CheapShark API", "AUTOMÁTICO", "Não", "Compara 30+ lojas PC e traz o Menor Preço Histórico sem precisar de conta", "cheapshark.com/api", "✅ Pronto (Sem Chave)"],
    ["ProtonDB + Steam Deck", "AUTOMÁTICO", "Não", "Nível de compatibilidade Linux / Steam Deck (Platinum, Gold, Verified...)", "protondb.com", "✅ Pronto (Sem Chave)"],
    ["GOG Catalog & Epic Freebies", "AUTOMÁTICO", "Não", "Preços DRM-free na GOG + lista automática dos Jogos Grátis da Semana na Epic", "gog.com / epicgames.com", "✅ Pronto (Sem Chave)"],
]
batch_ops.append({"op": "write", "range": "Config_APIs!A1:F36", "data": config_rows})

# --- BACKLOG ---
backlog_headers = [
    ["📚 MEU BACKLOG", "", "", "BIBLIOTECA MASTER — USE O MENU 🎮 BACKLOG MASTER PARA ENRIQUECER VIA HLTB, STEAM, PROTONDB, RAWG & IGDB"] + [""] * 27,
    [
        "ID", "Capa", "Título", "Status", "Prioridade", "Plataforma", "Loja / Origem",
        "Gênero", "Ano", "HLTB Main (h)", "HLTB Extra (h)", "HLTB 100% (h)",
        "Horas Jogadas", "Restante (h)", "Progresso", "Barra", "Conquistas",
        "Nota Crítica", "Minha Nota", "Preço Pago", "Custo/Hora", "Deck / ProtonDB",
        "Data Compra", "Data Início", "Data Fim", "Dias p/ Zerar", "Score Próximo",
        "Steam AppID", "URL Capa", "Link HLTB", "Anotações / Review"
    ],
]

# 15 iconic sample games with real Steam AppIDs & Steam header images so Dashboard + covers work IMMEDIATELY!
sample_games = [
    # Title, Status, Priority, Platform, Store, Genre, Year, Main, Extra, Comp, Played, Ach, Critic, MyScore, Price, Deck, BuyDate, StartDate, EndDate, AppID, CoverURL, Notes
    ("Elden Ring", "🏆 100% / Platina", "🔥 1 - Urgente", "PC", "Steam", "RPG de Ação", 2022, 60, 101, 134, 128.5, 1.0, 96, 10.0, 174.9, "🏆 Platinum", "2024-06-20", "2026-01-05", "2026-02-28", 1245620, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg", "Obra-prima absoluta. DLC Shadow of the Erdtree finalizada!"),
    ("Hollow Knight", "✅ Zerado", "⭐ 2 - Alta", "Steam Deck", "Steam", "Metroidvania", 2017, 27, 42, 64, 44.0, 0.78, 90, 9.5, 23.49, "✅ Verified", "2023-11-22", "2026-03-02", "2026-03-29", 367520, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/header.jpg", "Perfeito no portátil. Falta só o Panteão de Hallownest."),
    ("Baldur's Gate 3", "🕹️ Jogando", "🔥 1 - Urgente", "PC", "Steam", "RPG de Ação", 2023, 68, 112, 165, 58.0, 0.42, 96, 9.8, 199.99, "✅ Verified", "2024-12-20", "2026-09-10", "", 1086940, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/header.jpg", "No meio do Ato 3 — história incrível."),
    ("Hades", "✅ Zerado", "⭐ 2 - Alta", "Nintendo Switch", "Nintendo eShop", "Roguelike", 2020, 23, 49, 96, 52.0, "", 93, 9.5, 46.24, "✅ Verified", "2024-03-10", "2026-04-04", "2026-05-01", 1145360, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg", "Viciante, trilha sonora impecável."),
    ("Cyberpunk 2077", "📌 Backlog", "🔥 1 - Urgente", "PC", "GOG", "RPG de Ação", 2020, 26, 63, 105, 4.5, 0.08, 86, "", 79.96, "🥇 Gold", "2025-06-28", "", "", 1091500, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg", "Edição Ultimate com Phantom Liberty."),
    ("Celeste", "✅ Zerado", "⭐ 2 - Alta", "PC", "Epic Games", "Plataforma", 2018, 8.5, 13, 39, 14.0, "", 94, 9.2, 0.0, "✅ Verified", "2023-08-15", "2026-05-10", "2026-05-21", 504230, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/504230/header.jpg", "Resgatado grátis na Epic! Desafio perfeito."),
    ("Persona 5 Royal", "⏸️ Pausado", "⭐ 2 - Alta", "Xbox Series", "Game Pass", "JRPG", 2022, 101, 123, 143, 38.0, 0.30, 95, "", 0.0, "✅ Verified", "2025-02-01", "2026-06-01", "", 1687950, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1687950/header.jpg", "Pausado no 4º palácio, retomar nas férias."),
    ("God of War Ragnarök", "📌 Backlog", "🔥 1 - Urgente", "PS5", "PlayStation Store", "Aventura", 2022, 26.5, 41, 55, 0.0, 0.0, 94, "", 149.9, "🥇 Gold", "2025-11-28", "", "", 2322010, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2322010/header.jpg", "Comprado na Black Friday."),
    ("Disco Elysium - The Final Cut", "📌 Backlog", "⭐ 2 - Alta", "PC", "Steam", "Indie", 2019, 23, 32, 47, 1.5, 0.05, 97, "", 18.87, "✅ Verified", "2024-07-04", "", "", 632470, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/632470/header.jpg", "Ótima opção narrativa p/ noites calmas."),
    ("DOOM Eternal", "✅ Zerado", "👍 3 - Média", "Xbox Series", "Game Pass", "FPS", 2020, 14.5, 21, 29, 18.5, 0.65, 88, 8.8, 0.0, "🥇 Gold", "2025-01-12", "2026-07-03", "2026-07-19", 782330, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/782330/header.jpg", "Adrenalina pura do início ao fim."),
    ("The Witcher 3: Wild Hunt", "📌 Backlog", "👍 3 - Média", "PC", "GOG", "Mundo Aberto", 2015, 51, 103, 173, 12.0, 0.14, 93, "", 39.99, "✅ Verified", "2023-12-22", "", "", 292030, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/header.jpg", "Versão Next-Gen com as duas DLCs."),
    ("Resident Evil 4 Remake", "✅ Zerado", "🔥 1 - Urgente", "PS5", "PS Plus", "Terror", 2023, 16, 22, 61, 21.0, 0.58, 93, 9.4, 0.0, "✅ Verified", "2026-01-18", "2026-08-05", "2026-08-22", 2050650, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2050650/header.jpg", "Remake exemplar. Separate Ways pendente."),
    ("A Short Hike", "📌 Backlog", "⭐ 2 - Alta", "Steam Deck", "Steam", "Indie", 2019, 1.5, 3, 4.5, 0.0, 0.0, 88, "", 8.29, "✅ Verified", "2025-03-15", "", "", 1055540, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1055540/header.jpg", "Perfeito para zerar em uma tarde!"),
    ("Ori and the Will of the Wisps", "📌 Backlog", "⭐ 2 - Alta", "Nintendo Switch", "Nintendo eShop", "Metroidvania", 2020, 12, 15.5, 18.5, 0.0, 0.0, 90, "", 32.25, "✅ Verified", "2025-07-10", "", "", 1057090, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1057090/header.jpg", "Arte deslumbrante, duração ideal."),
    ("Balatro", "♾️ Contínuo / MP", "👍 3 - Média", "Steam Deck", "Steam", "Roguelike", 2024, 7.5, 41, 145, 34.0, 0.45, 90, 9.3, 40.49, "✅ Verified", "2026-02-14", "2026-02-14", "", 2379780, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2379780/header.jpg", "Impossível jogar só uma run."),
    ("Starfield", "💀 Dropado", "🧊 4 - Baixa", "Xbox Series", "Game Pass", "Mundo Aberto", 2023, 23, 70, 156, 11.0, 0.15, 83, 6.2, 0.0, "🥈 Silver", "2024-09-01", "2026-01-20", "", 1716740, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1716740/header.jpg", "Muitas telas de loading; dropei p/ focar em jogos melhores."),
]


def backlog_row_formulas(r):
    f_id = f'=IF(C{r}="","","G-"&TEXT(ROW()-2,"000"))'
    f_cover = f'=IF(AC{r}="","",IMAGE(AC{r},1))'
    f_rem = (
        f'=IF(C{r}="","",IF(OR(D{r}="✅ Zerado",D{r}="🏆 100% / Platina",'
        f'D{r}="💀 Dropado",D{r}="♾️ Contínuo / MP"),0,'
        f'MAX(0,IF(Config_APIs!$B$14=2,N(J{r}),IF(Config_APIs!$B$14=3,'
        f'IF(N(L{r})>0,N(L{r}),N(K{r})),IF(N(K{r})>0,N(K{r}),N(J{r}))))-N(M{r}))))'
    )
    f_prog = (
        f'=IF(C{r}="","",IF(OR(D{r}="✅ Zerado",D{r}="🏆 100% / Platina"),1,'
        f'IF(D{r}="💀 Dropado",0,IF(IF(N(K{r})>0,N(K{r}),N(J{r}))>0,'
        f'MIN(0.99,N(M{r})/IF(N(K{r})>0,N(K{r}),N(J{r}))),0))))'
    )
    f_bar = (
        f'=IF(C{r}="","",SPARKLINE(O{r},{{"charttype","bar";"max",1;'
        f'"color1",IF(O{r}>=1,"#10B981",IF(O{r}>=0.5,"#3B82F6","#F59E0B"))}}))'
    )
    f_cph = (
        f'=IF(C{r}="","",IF(N(T{r})=0,"Grátis",IF(N(M{r})>0,T{r}/M{r},'
        f'IF(N(K{r})>0,T{r}/K{r},IF(N(J{r})>0,T{r}/J{r},"")))))'
    )
    f_days = f'=IF(AND(ISNUMBER(X{r}),ISNUMBER(Y{r})),MAX(1,Y{r}-X{r}),"")'
    f_score = (
        f'=IF(OR(C{r}="",AND(D{r}<>"📌 Backlog",D{r}<>"⏸️ Pausado")),"",'
        f'ROUND('
        f'Config_APIs!$B$18*IF(E{r}="🔥 1 - Urgente",100,IF(E{r}="⭐ 2 - Alta",80,'
        f'IF(E{r}="👍 3 - Média",55,IF(E{r}="🧊 4 - Baixa",30,IF(E{r}="💤 5 - Talvez",15,50)))))+'
        f'Config_APIs!$B$19*IF(ISNUMBER(R{r}),R{r},75)+'
        f'Config_APIs!$B$20*MAX(15,MIN(100,100-IF(N(K{r})>0,K{r},IF(N(J{r})>0,J{r},20))*0.9))+'
        f'Config_APIs!$B$21*IF(ISNUMBER(W{r}),MIN(100,MAX(10,(TODAY()-W{r})/3.65)),50),1))'
    )
    f_link = f'=IF(C{r}="","",HYPERLINK("https://howlongtobeat.com/?q="&ENCODEURL(C{r}),"⏱️ HLTB"))'
    return f_id, f_cover, f_rem, f_prog, f_bar, f_cph, f_days, f_score, f_link


backlog_rows = list(backlog_headers)
for idx, g in enumerate(sample_games):
    r = idx + 3
    f_id, f_cover, f_rem, f_prog, f_bar, f_cph, f_days, f_score, f_link = backlog_row_formulas(r)
    (
        title, status, prio, plat, store, genre, year, h_main, h_extra, h_comp,
        played, ach, critic, my_score, price, deck, buy_d, start_d, end_d, appid, cover, notes
    ) = g
    backlog_rows.append([
        f_id, f_cover, title, status, prio, plat, store, genre, year,
        h_main, h_extra, h_comp, played, f_rem, f_prog, f_bar, ach,
        critic, my_score, price, f_cph, deck, buy_d, start_d, end_d,
        f_days, f_score, appid, cover, f_link, notes
    ])

# Pre-fill formula templates down to row 100 so adding new games works immediately!
for r in range(len(sample_games) + 3, 101):
    f_id, f_cover, f_rem, f_prog, f_bar, f_cph, f_days, f_score, f_link = backlog_row_formulas(r)
    backlog_rows.append([
        f_id, f_cover, "", "", "", "", "", "", "",
        "", "", "", "", f_rem, f_prog, f_bar, "",
        "", "", "", f_cph, "", "", "", "",
        f_days, f_score, "", "", f_link, ""
    ])

batch_ops.append({"op": "write", "range": "Backlog!A1:AE100", "data": backlog_rows})

# --- WISHLIST ---
wishlist_rows = [
    ["🏷️ WISHLIST", "", "RADAR DE PROMOÇÕES — ATUALIZE PREÇOS E MENOR HISTÓRICO VIA STEAM, CHEAPSHARK, ITAD & GOG"] + [""] * 16,
    [
        "Capa", "Título", "Plataforma", "Hype", "Lançamento", "HLTB Est. (h)",
        "Nota Crítica", "Preço Cheio", "Preço Atual", "Desconto",
        "Menor Histórico", "Preço Alvo", "Melhor Loja", "Sinal de Compra",
        "R$/Hora Est.", "Steam AppID", "Link Oferta", "Atualizado Em", "URL Capa"
    ],
]

sample_wishlist = [
    ("Hollow Knight: Silksong", "PC / Switch", "🔥 Day One", "2026-06-01", 35, 95, 119.9, 119.9, 119.9, 99.9, "Steam", 1030300, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1030300/header.jpg"),
    ("Metaphor: ReFantazio", "PC", "⭐ Quero Muito", "2024-10-11", 85, 94, 299.9, 149.95, 149.95, 160.0, "Nuuvem", 2679460, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2679460/header.jpg"),
    ("Hades II", "PC / Steam Deck", "🔥 Day One", "2025-09-25", 45, 94, 88.99, 71.19, 71.19, 75.0, "Steam", 1145350, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1145350/header.jpg"),
    ("Sekiro: Shadows Die Twice", "PC", "⭐ Quero Muito", "2019-03-22", 42, 90, 274.0, 137.0, 137.0, 120.0, "Steam", 814380, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/814380/header.jpg"),
    ("Clair Obscur: Expedition 33", "PC / PS5", "⭐ Quero Muito", "2025-04-24", 40, 92, 199.0, 159.2, 149.0, 130.0, "Steam", 1903340, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1903340/header.jpg"),
    ("Outer Wilds", "Steam Deck", "👍 Em Promoção", "2020-06-18", 22, 85, 67.99, 27.19, 27.19, 35.0, "Steam", 753640, "2026-11-23", "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/753640/header.jpg"),
]

for idx, w in enumerate(sample_wishlist):
    r = idx + 3
    title, plat, hype, rel, hltb, critic, full_p, cur_p, low_p, target_p, shop, appid, upd, cover = w
    wishlist_rows.append([
        f'=IF(S{r}="","",IMAGE(S{r},1))', title, plat, hype, rel, hltb, critic,
        full_p, cur_p,
        f'=IF(AND(ISNUMBER(H{r}),H{r}>0,ISNUMBER(I{r})),MAX(0,(H{r}-I{r})/H{r}),"")',
        low_p, target_p, shop,
        f'=IF(B{r}="","",IF(AND(ISNUMBER(I{r}),ISNUMBER(L{r}),I{r}<=L{r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I{r}),ISNUMBER(K{r}),K{r}>0,I{r}<=K{r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J{r}),J{r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar"))))',
        f'=IF(AND(ISNUMBER(I{r}),ISNUMBER(F{r}),F{r}>0),I{r}/F{r},"")',
        appid,
        f'=IF(B{r}="","",IF(P{r}<>"",HYPERLINK("https://store.steampowered.com/app/"&P{r},"🛒 Loja"),HYPERLINK("https://isthereanydeal.com/search/?q="&ENCODEURL(B{r}),"🔎 ITAD")))',
        upd, cover
    ])

for r in range(len(sample_wishlist) + 3, 61):
    wishlist_rows.append([
        f'=IF(S{r}="","",IMAGE(S{r},1))', "", "", "", "", "", "",
        "", "",
        f'=IF(AND(ISNUMBER(H{r}),H{r}>0,ISNUMBER(I{r})),MAX(0,(H{r}-I{r})/H{r}),"")',
        "", "", "",
        f'=IF(B{r}="","",IF(AND(ISNUMBER(I{r}),ISNUMBER(L{r}),I{r}<=L{r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I{r}),ISNUMBER(K{r}),K{r}>0,I{r}<=K{r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J{r}),J{r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar"))))',
        f'=IF(AND(ISNUMBER(I{r}),ISNUMBER(F{r}),F{r}>0),I{r}/F{r},"")',
        "",
        f'=IF(B{r}="","",IF(P{r}<>"",HYPERLINK("https://store.steampowered.com/app/"&P{r},"🛒 Loja"),HYPERLINK("https://isthereanydeal.com/search/?q="&ENCODEURL(B{r}),"🔎 ITAD")))',
        "", ""
    ])

batch_ops.append({"op": "write", "range": "Wishlist!A1:S60", "data": wishlist_rows})

# --- SESSOES ---
sessoes_rows = [
    ["⏱️ DIÁRIO DE SESSÕES DE JOGO — REGISTRE SUAS JOGATINAS (OU USE O MENU 🎮 BACKLOG MASTER)"] + [""] * 9,
    ["Data", "Jogo", "Plataforma", "Horas", "Diversão (1-5)", "Zerou?", "Mês", "Ano", "Mês/Ano", "Notas da Sessão"],
]
sample_sessions = [
    ("2026-01-14", "Elden Ring", 4.5, 5, "Não", "Derrotei Malenia depois de 22 tentativas!"),
    ("2026-02-28", "Elden Ring", 6.0, 5, "🏆 100% / Platina", "Platina concluída com final Era das Estrelas."),
    ("2026-03-29", "Hollow Knight", 5.0, 5, "✅ Zerado", "Radiance derrotada no Steam Deck."),
    ("2026-05-01", "Hades", 3.5, 5, "✅ Zerado", "10ª fuga completa — créditos finais!"),
    ("2026-05-21", "Celeste", 4.0, 5, "✅ Zerado", "Cheguei ao cume da montanha."),
    ("2026-07-19", "DOOM Eternal", 3.0, 4, "✅ Zerado", "Chefe final épico."),
    ("2026-08-22", "Resident Evil 4 Remake", 4.5, 5, "✅ Zerado", "Nota S no modo padrão."),
    ("2026-09-25", "Baldur's Gate 3", 6.5, 5, "Não", "Cheguei em Portão de Baldur (Ato 3)."),
    ("2026-10-18", "Baldur's Gate 3", 5.5, 5, "Não", "Casa da Esperança — música do Raphael sensacional!"),
    ("2026-11-15", "Balatro", 2.5, 5, "Não", "Finalmente venci o Gold Stake com o baralho xadrez."),
]
for idx, s in enumerate(sample_sessions):
    r = idx + 3
    dt, game, hrs, fun, beat, note = s
    sessoes_rows.append([
        dt, game,
        f'=IF(B{r}="","",IFERROR(INDEX(Backlog!$F$3:$F$500,MATCH(B{r},Backlog!$C$3:$C$500,0)),""))',
        hrs, fun, beat,
        f'=IF(ISNUMBER(A{r}),MONTH(A{r}),"")',
        f'=IF(ISNUMBER(A{r}),YEAR(A{r}),"")',
        f'=IF(ISNUMBER(A{r}),TEXT(A{r},"mm/yyyy"),"")',
        note
    ])
for r in range(len(sample_sessions) + 3, 61):
    sessoes_rows.append([
        "", "",
        f'=IF(B{r}="","",IFERROR(INDEX(Backlog!$F$3:$F$500,MATCH(B{r},Backlog!$C$3:$C$500,0)),""))',
        "", "", "",
        f'=IF(ISNUMBER(A{r}),MONTH(A{r}),"")',
        f'=IF(ISNUMBER(A{r}),YEAR(A{r}),"")',
        f'=IF(ISNUMBER(A{r}),TEXT(A{r},"mm/yyyy"),"")',
        ""
    ])
batch_ops.append({"op": "write", "range": "Sessoes!A1:J60", "data": sessoes_rows})

# --- GRATIS_ASSINATURAS ---
gratis_rows = [
    ["🎁 ASSINATURAS (ROI) & JOGOS GRÁTIS DA SEMANA (EPIC GAMES STORE API)"] + [""] * 7,
    ["Acompanhe se suas assinaturas estão se pagando e resgate automaticamente os jogos grátis semanais da Epic Games.", "", "", "", "", "", "", ""],
    ["💳 1. CONTROLE DE ASSINATURAS — VALE A PENA?", "", "", "", "", "", "", ""],
    ["Assinatura", "Tag na Loja (Backlog)", "Mensalidade (R$)", "Custo Anual (R$)", "Jogos no Acervo", "Zerados", "Horas Jogadas", "Custo / Hora (R$)"],
    ["Xbox Game Pass Ultimate", "Game Pass", 59.99, "=C5*12", '=COUNTIF(Backlog!$G$3:$G$500,B5)', '=COUNTIFS(Backlog!$G$3:$G$500,B5,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B5,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B5,Backlog!$M$3:$M$500)', '=IF(G5>0,D5/G5,"Sem horas")'],
    ["PlayStation Plus Extra", "PS Plus", 52.90, "=C6*12", '=COUNTIF(Backlog!$G$3:$G$500,B6)', '=COUNTIFS(Backlog!$G$3:$G$500,B6,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B6,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B6,Backlog!$M$3:$M$500)', '=IF(G6>0,D6/G6,"Sem horas")'],
    ["Amazon Prime Gaming", "Amazon Prime", 19.90, "=C7*12", '=COUNTIF(Backlog!$G$3:$G$500,B7)', '=COUNTIFS(Backlog!$G$3:$G$500,B7,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B7,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B7,Backlog!$M$3:$M$500)', '=IF(G7>0,D7/G7,"Sem horas")'],
    ["Humble Choice", "Humble Bundle", 69.00, "=C8*12", '=COUNTIF(Backlog!$G$3:$G$500,B8)', '=COUNTIFS(Backlog!$G$3:$G$500,B8,Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,B8,Backlog!$D$3:$D$500,"🏆 100% / Platina")', '=SUMIF(Backlog!$G$3:$G$500,B8,Backlog!$M$3:$M$500)', '=IF(G8>0,D8/G8,"Sem horas")'],
    ["TOTAL ASSINATURAS", "", "=SUM(C5:C8)", "=SUM(D5:D8)", "=SUM(E5:E8)", "=SUM(F5:F8)", "=SUM(G5:G8)", '=IF(G9>0,D9/G9,"—")'],
    ["", "", "", "", "", "", "", ""],
    ["🎁 2. JOGOS GRÁTIS DA SEMANA — EPIC GAMES STORE (CLIQUE EM 🎮 BACKLOG MASTER > BUSCAR GRÁTIS DA EPIC)", "", "", "", "", "", "", ""],
    ["Título do Jogo", "Status", "Disponível De", "Disponível Até", "Preço Original", "Resgatado?", "Link Epic Store", "Descrição"],
    ["(Clique no menu 🎮 Backlog Master > 🎁 Buscar Jogos Grátis da Epic para preencher ao vivo)", "🟡 Aguardando Sync", "", "", "", False, '=HYPERLINK("https://store.epicgames.com/pt-BR/free-games","🎁 Abrir Epic Grátis")', "A API pública da Epic não exige chave e traz os jogos gratuitos desta semana e da próxima!"],
]
batch_ops.append({"op": "write", "range": "Gratis_Assinaturas!A1:H13", "data": gratis_rows})

# --- ANALISES ---
analises_rows = [
    ["📊 MOTOR DE ANÁLISES & ESTATÍSTICAS — ALIMENTA AUTOMATICAMENTE O DASHBOARD"] + [""] * 12,
    ["Não precisa editar esta aba: todas as tabelas recalculam automaticamente a partir das abas Backlog e Sessoes."] + [""] * 12,
    ["1. DISTRIBUIÇÃO POR STATUS", "", "", "", "", "", "", "4. EVOLUÇÃO MENSAL (ANO DE REFERÊNCIA)", "", "", "", "", ""],
    ["Status", "Qtd", "% Acervo", "Horas Jogadas", "Restante HLTB (h)", "Investido (R$)", "", "Mês", "Zerados", "Comprados", "Horas Sessões", "Gasto (R$)", "Mês #"],
]

statuses = [
    "📌 Backlog", "🕹️ Jogando", "⏸️ Pausado", "✅ Zerado",
    "🏆 100% / Platina", "♾️ Contínuo / MP", "💀 Dropado", "🔄 Rejogando"
]
months = [
    ("Jan", 1), ("Fev", 2), ("Mar", 3), ("Abr", 4), ("Mai", 5), ("Jun", 6),
    ("Jul", 7), ("Ago", 8), ("Set", 9), ("Out", 10), ("Nov", 11), ("Dez", 12)
]

# Rows 5..16 (indices 0..11) combine Table 1 (rows 5..12 + total row 13) and Table 4 (rows 5..16 + total row 17)
for i in range(13):
    r = i + 5
    # Left side: Table 1 (rows 5..12 = statuses, row 13 = TOTAL, rows 14..17 blank/Table 2 header)
    if i < len(statuses):
        st = statuses[i]
        left = [
            st,
            f'=COUNTIF(Backlog!$D$3:$D$500,A{r})',
            f'=IF($B$13>0,B{r}/$B$13,0)',
            f'=SUMIF(Backlog!$D$3:$D$500,A{r},Backlog!$M$3:$M$500)',
            f'=SUMIF(Backlog!$D$3:$D$500,A{r},Backlog!$N$3:$N$500)',
            f'=SUMIF(Backlog!$D$3:$D$500,A{r},Backlog!$T$3:$T$500)',
        ]
    elif i == len(statuses):
        left = ["TOTAL", "=SUM(B5:B12)", "=SUM(C5:C12)", "=SUM(D5:D12)", "=SUM(E5:E12)", "=SUM(F5:F12)"]
    elif i == 9:
        left = ["", "", "", "", "", ""]
    elif i == 10:
        left = ["2. DISTRIBUIÇÃO POR PLATAFORMA", "", "", "", "", ""]
    elif i == 11:
        left = ["Plataforma", "Total", "Zerados", "% Conclusão", "Horas Jogadas", "Investido (R$)"]
    else:
        left = ["PC", f'=COUNTIF(Backlog!$F$3:$F$500,A{r})', f'=COUNTIFS(Backlog!$F$3:$F$500,A{r},Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$F$3:$F$500,A{r},Backlog!$D$3:$D$500,"🏆 100% / Platina")', f'=IF(B{r}>0,C{r}/B{r},0)', f'=SUMIF(Backlog!$F$3:$F$500,A{r},Backlog!$M$3:$M$500)', f'=SUMIF(Backlog!$F$3:$F$500,A{r},Backlog!$T$3:$T$500)']

    # Right side: Table 4 (months 1..12 on rows 5..16, TOTAL on row 17)
    if i < 12:
        m_name, m_num = months[i]
        right = [
            m_name,
            f'=COUNTIFS(Backlog!$Y$3:$Y$500,">="&DATE(Config_APIs!$B$8,M{r},1),Backlog!$Y$3:$Y$500,"<="&EOMONTH(DATE(Config_APIs!$B$8,M{r},1),0))',
            f'=COUNTIFS(Backlog!$W$3:$W$500,">="&DATE(Config_APIs!$B$8,M{r},1),Backlog!$W$3:$W$500,"<="&EOMONTH(DATE(Config_APIs!$B$8,M{r},1),0))',
            f'=SUMIFS(Sessoes!$D$3:$D$500,Sessoes!$G$3:$G$500,M{r},Sessoes!$H$3:$H$500,Config_APIs!$B$8)',
            f'=SUMIFS(Backlog!$T$3:$T$500,Backlog!$W$3:$W$500,">="&DATE(Config_APIs!$B$8,M{r},1),Backlog!$W$3:$W$500,"<="&EOMONTH(DATE(Config_APIs!$B$8,M{r},1),0))',
            m_num,
        ]
    else:
        right = ["TOTAL ANO", "=SUM(I5:I16)", "=SUM(J5:J16)", "=SUM(K5:K16)", "=SUM(L5:L16)", ""]

    analises_rows.append(left + [""] + right)

# Continue Platforms (rows 18..25) and Right side Table 5: HLTB Duration Bands (rows 19..25)
platforms_rest = ["PS5", "PS4", "Xbox Series", "Xbox One", "Nintendo Switch", "Switch 2", "Steam Deck", "Mobile", "Retro / Emulador"]
hltb_right_rows = [
    ["", "", "", "", "", ""],  # row 18
    ["5. FAIXAS DE DURAÇÃO HLTB", "", "", "", "", ""],  # row 19
    ["Faixa de Duração", "No Backlog", "Zerados", "Total", "Horas Restantes", ""],  # row 20
    [
        "⚡ Curto (<10h)",
        '=COUNTIFS(Backlog!$D$3:$D$500,"📌 Backlog",Backlog!$K$3:$K$500,">0",Backlog!$K$3:$K$500,"<10")',
        '=COUNTIFS(Backlog!$D$3:$D$500,"✅ Zerado",Backlog!$K$3:$K$500,">0",Backlog!$K$3:$K$500,"<10")+COUNTIFS(Backlog!$D$3:$D$500,"🏆 100% / Platina",Backlog!$K$3:$K$500,">0",Backlog!$K$3:$K$500,"<10")',
        '=COUNTIFS(Backlog!$K$3:$K$500,">0",Backlog!$K$3:$K$500,"<10")',
        '=SUMIFS(Backlog!$N$3:$N$500,Backlog!$K$3:$K$500,">0",Backlog!$K$3:$K$500,"<10")',
        ""
    ],  # row 21
    [
        "⏱️ Médio (10-25h)",
        '=COUNTIFS(Backlog!$D$3:$D$500,"📌 Backlog",Backlog!$K$3:$K$500,">=10",Backlog!$K$3:$K$500,"<25")',
        '=COUNTIFS(Backlog!$D$3:$D$500,"✅ Zerado",Backlog!$K$3:$K$500,">=10",Backlog!$K$3:$K$500,"<25")+COUNTIFS(Backlog!$D$3:$D$500,"🏆 100% / Platina",Backlog!$K$3:$K$500,">=10",Backlog!$K$3:$K$500,"<25")',
        '=COUNTIFS(Backlog!$K$3:$K$500,">=10",Backlog!$K$3:$K$500,"<25")',
        '=SUMIFS(Backlog!$N$3:$N$500,Backlog!$K$3:$K$500,">=10",Backlog!$K$3:$K$500,"<25")',
        ""
    ],  # row 22
    [
        "🏔️ Longo (25-60h)",
        '=COUNTIFS(Backlog!$D$3:$D$500,"📌 Backlog",Backlog!$K$3:$K$500,">=25",Backlog!$K$3:$K$500,"<60")',
        '=COUNTIFS(Backlog!$D$3:$D$500,"✅ Zerado",Backlog!$K$3:$K$500,">=25",Backlog!$K$3:$K$500,"<60")+COUNTIFS(Backlog!$D$3:$D$500,"🏆 100% / Platina",Backlog!$K$3:$K$500,">=25",Backlog!$K$3:$K$500,"<60")',
        '=COUNTIFS(Backlog!$K$3:$K$500,">=25",Backlog!$K$3:$K$500,"<60")',
        '=SUMIFS(Backlog!$N$3:$N$500,Backlog!$K$3:$K$500,">=25",Backlog!$K$3:$K$500,"<60")',
        ""
    ],  # row 23
    [
        "🐉 Épico (60h+)",
        '=COUNTIFS(Backlog!$D$3:$D$500,"📌 Backlog",Backlog!$K$3:$K$500,">=60")',
        '=COUNTIFS(Backlog!$D$3:$D$500,"✅ Zerado",Backlog!$K$3:$K$500,">=60")+COUNTIFS(Backlog!$D$3:$D$500,"🏆 100% / Platina",Backlog!$K$3:$K$500,">=60")',
        '=COUNTIFS(Backlog!$K$3:$K$500,">=60")',
        '=SUMIFS(Backlog!$N$3:$N$500,Backlog!$K$3:$K$500,">=60")',
        ""
    ],  # row 24
    ["TOTAL", "=SUM(I21:I24)", "=SUM(J21:J24)", "=SUM(K21:K24)", "=SUM(L21:L24)", ""],  # row 25
    ["", "", "", "", "", ""],  # row 26
]

for idx, plat in enumerate(platforms_rest):
    r = 18 + idx
    left = [
        plat,
        f'=COUNTIF(Backlog!$F$3:$F$500,A{r})',
        f'=COUNTIFS(Backlog!$F$3:$F$500,A{r},Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$F$3:$F$500,A{r},Backlog!$D$3:$D$500,"🏆 100% / Platina")',
        f'=IF(B{r}>0,C{r}/B{r},0)',
        f'=SUMIF(Backlog!$F$3:$F$500,A{r},Backlog!$M$3:$M$500)',
        f'=SUMIF(Backlog!$F$3:$F$500,A{r},Backlog!$T$3:$T$500)',
    ]
    right = hltb_right_rows[idx] if idx < len(hltb_right_rows) else ["", "", "", "", "", ""]
    analises_rows.append(left + [""] + right)

# Row 27: Blank
analises_rows.append([""] * 13)
# Row 28: Section 3 (Genres) & Section 6 (Stores)
analises_rows.append(["3. DISTRIBUIÇÃO POR GÊNERO", "", "", "", "", "", "", "6. DISTRIBUIÇÃO POR LOJA / ORIGEM", "", "", "", "", ""])
# Row 29: Headers
analises_rows.append(["Gênero", "Qtd", "Zerados", "Horas Jogadas", "HLTB Médio (h)", "Nota Média", "", "Loja / Origem", "Qtd", "Zerados", "Horas Jogadas", "Investido (R$)", "Custo Médio"])

genres_list = ["RPG de Ação", "Metroidvania", "Roguelike", "Aventura", "FPS", "Indie", "Estratégia", "Terror", "Plataforma", "Mundo Aberto", "JRPG", "Puzzle"]
stores_list = ["Steam", "Epic Games", "GOG", "PlayStation Store", "Xbox Store", "Game Pass", "PS Plus", "Nintendo eShop", "Amazon Prime", "Humble Bundle", "Mídia Física", "Outro"]

for idx in range(len(genres_list)):
    r = 30 + idx
    g = genres_list[idx]
    s = stores_list[idx]
    left = [
        g,
        f'=COUNTIF(Backlog!$H$3:$H$500,A{r})',
        f'=COUNTIFS(Backlog!$H$3:$H$500,A{r},Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$H$3:$H$500,A{r},Backlog!$D$3:$D$500,"🏆 100% / Platina")',
        f'=SUMIF(Backlog!$H$3:$H$500,A{r},Backlog!$M$3:$M$500)',
        f'=IFERROR(AVERAGEIF(Backlog!$H$3:$H$500,A{r},Backlog!$K$3:$K$500),0)',
        f'=IFERROR(AVERAGEIF(Backlog!$H$3:$H$500,A{r},Backlog!$S$3:$S$500),0)',
    ]
    right = [
        s,
        f'=COUNTIF(Backlog!$G$3:$G$500,H{r})',
        f'=COUNTIFS(Backlog!$G$3:$G$500,H{r},Backlog!$D$3:$D$500,"✅ Zerado")+COUNTIFS(Backlog!$G$3:$G$500,H{r},Backlog!$D$3:$D$500,"🏆 100% / Platina")',
        f'=SUMIF(Backlog!$G$3:$G$500,H{r},Backlog!$M$3:$M$500)',
        f'=SUMIF(Backlog!$G$3:$G$500,H{r},Backlog!$T$3:$T$500)',
        f'=IF(I{r}>0,L{r}/I{r},0)',
    ]
    analises_rows.append(left + [""] + right)

batch_ops.append({"op": "write", "range": "Analises!A1:M41", "data": analises_rows})

# --- DASHBOARD ---
dash_rows = [["" for _ in range(12)] for _ in range(23)]
# Banner
dash_rows[0][0] = "🎮 GAME BACKLOG MASTER — PAINEL DE CONTROLE"
dash_rows[1][0] = '="Acervo: "&COUNTA(Backlog!C3:C500)&" jogos  •  Zerados em "&Config_APIs!B8&": "&Analises!I17&"/"&Config_APIs!B6&"  •  Ritmo configurado: "&Config_APIs!B7&"h/semana  •  Atualizado: "&TEXT(TODAY(),"dd/mm/yyyy")'

# Row 4 (idx 3): KPI Titles
dash_rows[3][0] = "📚 TOTAL NO ACERVO"
dash_rows[3][2] = "🕹️ JOGANDO AGORA"
dash_rows[3][4] = "🏆 ZERADOS / 100%"
dash_rows[3][6] = "⏳ HORAS NO BACKLOG"
dash_rows[3][8] = "💰 INVESTIMENTO TOTAL"
dash_rows[3][10] = "💸 PARADO NO BACKLOG"

# Row 5 (idx 4): KPI Big Numbers
dash_rows[4][0] = "=COUNTA(Backlog!C3:C500)"
dash_rows[4][2] = '=COUNTIF(Backlog!D3:D500,"🕹️ Jogando")'
dash_rows[4][4] = '=COUNTIF(Backlog!D3:D500,"✅ Zerado")+COUNTIF(Backlog!D3:D500,"🏆 100% / Platina")'
dash_rows[4][6] = "=SUM(Backlog!N3:N500)"
dash_rows[4][8] = "=SUM(Backlog!T3:T500)"
dash_rows[4][10] = '=SUMIF(Backlog!D3:D500,"📌 Backlog",Backlog!T3:T500)+SUMIF(Backlog!D3:D500,"⏸️ Pausado",Backlog!T3:T500)'

# Row 6 (idx 5): KPI Sub-metrics
dash_rows[5][0] = '=COUNTIF(Backlog!D3:D500,"📌 Backlog")&" na fila do Backlog"'
dash_rows[5][2] = '=COUNTIF(Backlog!D3:D500,"⏸️ Pausado")&" pausados • "&COUNTIF(Backlog!D3:D500,"♾️ Contínuo / MP")&" contínuos"'
dash_rows[5][4] = '=IF(COUNTA(Backlog!C3:C500)>0,TEXT((COUNTIF(Backlog!D3:D500,"✅ Zerado")+COUNTIF(Backlog!D3:D500,"🏆 100% / Platina"))/COUNTA(Backlog!C3:C500),"0.0%")&" taxa de conclusão","0%")'
dash_rows[5][6] = '=IF(Config_APIs!B7>0,"~"&ROUND(SUM(Backlog!N3:N500)/(Config_APIs!B7*4.33),1)&" meses ("&ROUND(SUM(Backlog!N3:N500)/Config_APIs!B7,0)&" sem)","Defina h/sem")'
dash_rows[5][8] = '=IF(SUM(Backlog!M3:M500)>0,"R$ "&TEXT(SUM(Backlog!T3:T500)/SUM(Backlog!M3:M500),"#,##0.00")&" / hora jogada","—")'
dash_rows[5][10] = '=IF(COUNT(Backlog!S3:S500)>0,"⭐ Nota Média: "&TEXT(AVERAGE(Backlog!S3:S500),"0.0")&" / 10","Sem notas ainda")'

# Row 8 (idx 7): Section headers for Goals & Wishlist Radar
dash_rows[7][0] = "🎯 META ANUAL & RITMO DE JOGO"
dash_rows[7][7] = "🔥 RADAR DA WISHLIST & ALERTAS"

# Rows 9..13 (idx 8..12) Left: Annual Goal
dash_rows[8][0] = "Meta do Ano"
dash_rows[8][2] = '=Analises!I17&" / "&Config_APIs!B6&" jogos"'
dash_rows[8][4] = '=IF(Config_APIs!B6>0,Analises!I17/Config_APIs!B6,0)'
dash_rows[9][0] = "Progresso da Meta"
dash_rows[9][2] = '=SPARKLINE(MIN(1,IF(Config_APIs!B6>0,Analises!I17/Config_APIs!B6,0)),{"charttype","bar";"max",1;"color1","#10B981"})'
dash_rows[10][0] = "Ritmo Projetado no Ano"
dash_rows[10][2] = '=IF(MONTH(TODAY())>0,ROUND(Analises!I17/(MONTH(TODAY())/12),1)&" jogos/ano","—")'
dash_rows[10][4] = '=IF(Analises!I17>=Config_APIs!B6,"🏆 Meta Batida!",IF(Analises!I17/(MONTH(TODAY())/12)>=Config_APIs!B6,"🟢 No Ritmo","🟡 Acelerar"))'
dash_rows[11][0] = "Total de Horas Jogadas"
dash_rows[11][2] = '=ROUND(SUM(Backlog!M3:M500),1)&" h"'
dash_rows[11][4] = '=IF(COUNT(Backlog!Z3:Z500)>0,"Média: "&ROUND(AVERAGE(Backlog!Z3:Z500),0)&" dias/jogo","—")'
dash_rows[12][0] = "Média HLTB (Jogos Zerados)"
dash_rows[12][2] = '=IFERROR(ROUND(AVERAGEIF(Backlog!D3:D500,"✅ Zerado",Backlog!K3:K500),1)&" h","—")'
dash_rows[12][4] = '=COUNTIF(Backlog!D3:D500,"🏆 100% / Platina")&" Platinas / 100%"'

# Rows 9..13 (idx 8..12) Right: Wishlist Radar
dash_rows[8][7] = "Jogos na Wishlist"
dash_rows[8][10] = "=COUNTA(Wishlist!B3:B300)"
dash_rows[9][7] = "🎯 Prontos p/ Comprar (≤ Alvo)"
dash_rows[9][10] = '=COUNTIF(Wishlist!N3:N300,"🎯 COMPRAR AGORA!")'
dash_rows[10][7] = "🔥 Em Menor Histórico"
dash_rows[10][10] = '=COUNTIF(Wishlist!N3:N300,"🔥 MENOR HISTÓRICO")'
dash_rows[11][7] = "Custo Atual da Wishlist"
dash_rows[11][10] = "=SUM(Wishlist!I3:I300)"
dash_rows[12][7] = "Economia Atual vs Cheio"
dash_rows[12][10] = "=MAX(0,SUM(Wishlist!H3:H300)-SUM(Wishlist!I3:I300))"

# Row 15 (idx 14): Section headers for Top 5 Next Games & Hall of Fame
dash_rows[14][0] = "🎲 TOP 5 PRÓXIMOS JOGOS RECOMENDADOS (SCORE INTELIGENTE)"
dash_rows[14][7] = "🏅 HALL DA FAMA & CURINGAS DO BACKLOG"

# Row 16 (idx 15): Headers for Top 5 & Hall of Fame
dash_rows[15][0] = "#"
dash_rows[15][1] = "Título"
dash_rows[15][2] = "Plataforma"
dash_rows[15][3] = "Prioridade"
dash_rows[15][4] = "HLTB (h)"
dash_rows[15][5] = "Crítica"
dash_rows[15][6] = "Score"

dash_rows[15][7] = "Destaque"
dash_rows[15][9] = "Jogo"
dash_rows[15][11] = "Valor"

# Rows 17..21 (idx 16..20): Ranks 1..5 + dynamic SORTN spilling across B17:G21!
for rank in range(1, 6):
    dash_rows[15 + rank][0] = f"#{rank}"
dash_rows[16][1] = '=IFERROR(SORTN(FILTER(HSTACK(Backlog!C3:C500,Backlog!F3:F500,Backlog!E3:E500,Backlog!K3:K500,Backlog!R3:R500,Backlog!AA3:AA500),ISNUMBER(Backlog!AA3:AA500)),5,0,6,FALSE),"Adicione jogos com status 📌 Backlog!")'

# Hall of Fame rows (idx 16..20 = rows 17..21)
dash_rows[16][7] = "🥇 Melhor Nota Pessoal"
dash_rows[16][9] = '=IFERROR(INDEX(Backlog!C3:C500,MATCH(MAX(Backlog!S3:S500),Backlog!S3:S500,0)),"—")'
dash_rows[16][11] = '=IFERROR(MAX(Backlog!S3:S500),"—")'

dash_rows[17][7] = "⏱️ Jogo Mais Jogado"
dash_rows[17][9] = '=IFERROR(INDEX(Backlog!C3:C500,MATCH(MAX(Backlog!M3:M500),Backlog!M3:M500,0)),"—")'
dash_rows[17][11] = '=IFERROR(MAX(Backlog!M3:M500)&" h","—")'

dash_rows[18][7] = "⚡ Quick Win (Mais Curto na Fila)"
dash_rows[18][9] = '=IFERROR(INDEX(FILTER(Backlog!C3:C500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0),MATCH(MIN(FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0)),FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0),0)),"—")'
dash_rows[18][11] = '=IFERROR(MIN(FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0))&" h","—")'

dash_rows[19][7] = "🐉 Maior Épico na Fila"
dash_rows[19][9] = '=IFERROR(INDEX(FILTER(Backlog!C3:C500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0),MATCH(MAX(FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0)),FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0),0)),"—")'
dash_rows[19][11] = '=IFERROR(MAX(FILTER(Backlog!K3:K500,Backlog!D3:D500="📌 Backlog",Backlog!K3:K500>0))&" h","—")'

dash_rows[20][7] = "💎 Melhor Custo/Hora Pago"
dash_rows[20][9] = '=IFERROR(INDEX(FILTER(Backlog!C3:C500,ISNUMBER(Backlog!U3:U500),Backlog!U3:U500>0),MATCH(MIN(FILTER(Backlog!U3:U500,ISNUMBER(Backlog!U3:U500),Backlog!U3:U500>0)),FILTER(Backlog!U3:U500,ISNUMBER(Backlog!U3:U500),Backlog!U3:U500>0),0)),"—")'
dash_rows[20][11] = '=IFERROR("R$ "&TEXT(MIN(FILTER(Backlog!U3:U500,ISNUMBER(Backlog!U3:U500),Backlog!U3:U500>0)),"#,##0.00")&"/h","—")'

# Row 23 (idx 22): Charts Section Banner
dash_rows[22][0] = "📈 GRÁFICOS & ANÁLISE VISUAL DO ACERVO"

batch_ops.append({"op": "write", "range": "Dashboard!A1:L23", "data": dash_rows})

# --- GUIA_FUNCOES ---
guia_rows = [
    ["📖 GUIA DE INSTALAÇÃO DO APPS SCRIPT & REFERÊNCIA DE FUNÇÕES PERSONALIZADAS", "", "", "", "", ""],
    ["Siga os 4 passos abaixo (leva menos de 2 minutos) para ativar o menu 🎮 Backlog Master, a barra lateral interativa e todas as fórmulas de API!", "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["🚀 PASSO A PASSO PARA ATIVAR AS AUTOMAÇÕES & APIS", "", "", "", "", ""],
    ["Passo", "Ação", "Detalhes", "", "", ""],
    ["1", "Abra o Editor do Apps Script", "Nesta planilha, clique no menu superior em Extensões → Apps Script.", "", "", ""],
    ["2", "Cole o código BacklogMaster_ALL_IN_ONE.gs", "Apague o código inicial do arquivo Código.gs e cole o conteúdo de BacklogMaster_ALL_IN_ONE.gs (fornecido no seu projeto).", "", "", ""],
    ["3", "Adicione o arquivo Sidebar.html", "Clique no botão '+' ao lado de Arquivos → HTML → dê o nome exato 'Sidebar' e cole o conteúdo de Sidebar.html.", "", "", ""],
    ["4", "Salve e recarregue a planilha", "Salve (Ctrl+S), feche a aba do Apps Script e atualize (F5) o Google Sheets. O menu '🎮 Backlog Master' aparecerá no topo!", "", "", ""],
    ["", "", "", "", "", ""],
    ["⚡ CATÁLOGO DE FUNÇÕES PERSONALIZADAS (FÓRMULAS DIRETAS NA CÉLULA)", "", "", "", "", ""],
    ["Função", "Sintaxe", "API Usada", "Precisa Chave?", "O que retorna", "Exemplo"],
    ["HLTB_MAIN", '\'=HLTB_MAIN("Elden Ring")', "HowLongToBeat", "Não", "Tempo médio da História Principal (em horas)", "60"],
    ["HLTB_EXTRA", '\'=HLTB_EXTRA("Elden Ring")', "HowLongToBeat", "Não", "Tempo médio Principal + Extras (em horas)", "101"],
    ["HLTB_COMP", '\'=HLTB_COMP("Elden Ring")', "HowLongToBeat", "Não", "Tempo médio Complecionista / 100% (em horas)", "134"],
    ["HLTB_ALL", '\'=HLTB_ALL("Elden Ring")', "HowLongToBeat", "Não", "Preenche 4 colunas de uma vez: [Main, Extra, 100%, Link HLTB]", "60 | 101 | 134 | URL"],
    ["STEAM_APPID", '\'=STEAM_APPID("Hollow Knight")', "Steam Store API", "Não", "Retorna o Steam AppID oficial do jogo", "367520"],
    ["STEAM_PRECO", '\'=STEAM_PRECO(1245620)', "Steam Store API", "Não", "Preço atual na Steam (no país da aba Config_APIs, padrão BR)", "229.90"],
    ["STEAM_DESCONTO", '\'=STEAM_DESCONTO(1245620)', "Steam Store API", "Não", "Percentual de desconto ativo na Steam (ex.: 0.5 = 50%)", "40%"],
    ["STEAM_NOTA", '\'=STEAM_NOTA(1245620)', "Steam Store API", "Não", "Nota Metacritic (ou % de avaliações positivas Steam como fallback)", "96"],
    ["STEAM_CAPA", '\'=STEAM_CAPA(1245620)', "Steam Store API", "Não", "URL da imagem oficial de capa (use com =IMAGE(STEAM_CAPA(...),1))", "https://..."],
    ["PROTONDB_TIER", '\'=PROTONDB_TIER(1245620)', "ProtonDB API", "Não", "Classificação Steam Deck / Linux (Platinum, Gold, Silver...)", "🏆 Platinum"],
    ["CHEAPSHARK_ATUAL", '\'=CHEAPSHARK_ATUAL("Hollow Knight")', "CheapShark API", "Não", "Menor preço atual entre 30+ lojas PC (convertido p/ BRL)", "23.49"],
    ["CHEAPSHARK_MENOR", '\'=CHEAPSHARK_MENOR("Hollow Knight")', "CheapShark API", "Não", "Menor preço histórico já registrado (convertido p/ BRL)", "18.50"],
    ["GOG_PRECO", '\'=GOG_PRECO("Cyberpunk 2077")', "GOG Catalog API", "Não", "Preço atual DRM-free na loja GOG", "79.96"],
    ["ITAD_PRECO", '\'=ITAD_PRECO("Hades II", "atual")', "IsThereAnyDeal v2", "Sim (Grátis)", 'Preço "atual", "menor" (histórico) ou "loja" em BRL (inclui Nuuvem!)', "71.19"],
    ["RAWG_INFO", '\'=RAWG_INFO("God of War", "metacritic")', "RAWG.io API", "Sim (Grátis)", 'Retorna "metacritic", "ano", "genero", "capa" ou "playtime" (multi-plataforma)', "94"],
    ["IGDB_INFO", '\'=IGDB_INFO("Zelda Tears", "nota")', "IGDB v4 (Twitch)", "Sim (Grátis)", 'Retorna "nota", "ano", "genero", "capa" ou "plataformas" (consoles + retro)', "96"],
    ["", "", "", "", "", ""],
    ["💡 DICA DE PERFORMANCE PARA BACKLOGS GRANDES (100+ JOGOS)", "", "", "", "", ""],
    ["Prefira os botões do menu 🎮 Backlog Master (Enriquecer Linha / Enriquecer em Lote / Atualizar Wishlist) em vez de colocar centenas de fórmulas =HLTB_MAIN() simultâneas. Os botões gravam os valores fixos nas células — mantendo a planilha instantânea e sem limites de requisição!", "", "", "", "", ""],
]
batch_ops.append({"op": "write", "range": "Guia_Funcoes!A1:F31", "data": guia_rows})

def to_ptbr_formula(val):
    """Convert canonical EN formula syntax to pt_BR locale syntax for Sheets API."""
    if not isinstance(val, str) or not val.startswith("="):
        return val
    out = []
    in_str = False
    brace_depth = 0
    i = 0
    n = len(val)
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
        # Outside string literal
        if ch == "{":
            brace_depth += 1
            out.append(ch)
        elif ch == "}":
            brace_depth = max(0, brace_depth - 1)
            out.append(ch)
        elif ch == ",":
            # In pt_BR: inside { ... } array literal, column separator is '\';
            # outside, argument separator is ';'
            if brace_depth > 0:
                # Check if we are inside a nested function call inside braces, e.g. IF(O3>=1, ...)
                # Count unmatched '(' since last '{'
                sub = "".join(out)
                last_brace = sub.rfind("{")
                tail = sub[last_brace + 1:]
                paren_depth = tail.count("(") - tail.count(")")
                out.append(";" if paren_depth > 0 else "\\")
            else:
                out.append(";")
        elif ch == "." and i > 0 and i + 1 < n and val[i - 1].isdigit() and val[i + 1].isdigit():
            out.append(",")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def localize_batch_ops(ops):
    localized = []
    for op in ops:
        new_op = dict(op)
        if "data" in new_op:
            new_op["data"] = [[to_ptbr_formula(cell) for cell in row] for row in new_op["data"]]
        localized.append(new_op)
    return localized


with open(os.path.join(OUT_DIR, "02_values.json"), "w", encoding="utf-8") as f:
    json.dump(localize_batch_ops(batch_ops), f, ensure_ascii=False, indent=2)


# =====================================================================
# 3. COMPLETE VISUAL STYLING, FORMATS, VALIDATIONS & CONDITIONAL RULES
# =====================================================================
style_reqs = []

# Global font & base text style on every tab
for sid, _, rows, cols, _, _, _, _ in SHEET_DEFS:
    style_reqs.append(
        repeat_cell(
            sid, 0, min(rows, 120), 0, cols,
            {
                "textFormat": {"fontFamily": "Inter", "fontSize": 10, "foregroundColor": hex_to_rgb("#1E293B")},
                "verticalAlignment": "MIDDLE",
            },
            "userEnteredFormat.textFormat,userEnteredFormat.verticalAlignment",
        )
    )

def banner_style(sid, cols, bg="#0F172A", split_col=0):
    reqs = [
        row_height(sid, 0, 1, 44),
        repeat_cell(
            sid, 0, 1, 0, cols,
            {
                "backgroundColor": hex_to_rgb(bg),
                "textFormat": {"fontFamily": "Inter", "fontSize": 13, "bold": True, "foregroundColor": hex_to_rgb("#FFFFFF")},
                "horizontalAlignment": "LEFT",
                "verticalAlignment": "MIDDLE",
                "padding": {"left": 12},
            },
        ),
    ]
    if split_col > 0:
        reqs.append(merge_cells(sid, 0, 1, 0, split_col))
        reqs.append(merge_cells(sid, 0, 1, split_col, cols))
        reqs.append(repeat_cell(
            sid, 0, 1, split_col, cols,
            {
                "backgroundColor": hex_to_rgb("#1E293B") if bg == "#0F172A" else hex_to_rgb("#9D174D"),
                "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#E2E8F0")},
                "horizontalAlignment": "LEFT",
                "verticalAlignment": "MIDDLE",
                "padding": {"left": 12},
            },
        ))
    else:
        reqs.append(merge_cells(sid, 0, 1, 0, cols))
    return reqs

def table_header_style(sid, row_idx, c1, c2, bg="#1E293B"):
    return [
        row_height(sid, row_idx, row_idx + 1, 32),
        repeat_cell(
            sid, row_idx, row_idx + 1, c1, c2,
            {
                "backgroundColor": hex_to_rgb(bg),
                "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#F8FAFC")},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
                "wrapStrategy": "WRAP",
            },
        ),
    ]

def section_bar(sid, row_idx, c1, c2, bg="#4F46E5"):
    return [
        merge_cells(sid, row_idx, row_idx + 1, c1, c2),
        row_height(sid, row_idx, row_idx + 1, 28),
        repeat_cell(
            sid, row_idx, row_idx + 1, c1, c2,
            {
                "backgroundColor": hex_to_rgb(bg),
                "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#FFFFFF")},
                "horizontalAlignment": "LEFT",
                "verticalAlignment": "MIDDLE",
                "padding": {"left": 10},
            },
        ),
    ]

# --- STYLE DASHBOARD (sheetId 0) ---
style_reqs.append(repeat_cell(0, 0, 62, 0, 13, {"backgroundColor": hex_to_rgb("#F1F5F9")}, "userEnteredFormat.backgroundColor"))
# Banner row 0-1
style_reqs += [
    merge_cells(0, 0, 1, 0, 12),
    merge_cells(0, 1, 2, 0, 12),
    row_height(0, 0, 1, 44),
    row_height(0, 1, 2, 24),
    row_height(0, 2, 3, 12),
    repeat_cell(0, 0, 1, 0, 12, {
        "backgroundColor": hex_to_rgb("#0F172A"),
        "textFormat": {"fontFamily": "Inter", "fontSize": 16, "bold": True, "foregroundColor": hex_to_rgb("#FFFFFF")},
        "horizontalAlignment": "LEFT", "verticalAlignment": "MIDDLE", "padding": {"left": 14},
    }),
    repeat_cell(0, 1, 2, 0, 12, {
        "backgroundColor": hex_to_rgb("#1E293B"),
        "textFormat": {"fontFamily": "Inter", "fontSize": 9, "foregroundColor": hex_to_rgb("#CBD5E1")},
        "horizontalAlignment": "LEFT", "verticalAlignment": "MIDDLE", "padding": {"left": 14},
    }),
]

# KPI Cards (rows 3..5, 6 cards of 2 cols each)
kpi_colors = [
    ("#EEF2FF", "#4F46E5"),  # Indigo
    ("#E0F2FE", "#0284C7"),  # Sky
    ("#ECFDF5", "#059669"),  # Emerald
    ("#FEF3C7", "#D97706"),  # Amber
    ("#F3E8FF", "#7C3AED"),  # Purple
    ("#FFE4E6", "#E11D48"),  # Rose
]
style_reqs += [row_height(0, 3, 4, 24), row_height(0, 4, 5, 40), row_height(0, 5, 6, 22), row_height(0, 6, 7, 12)]
for idx, (bg, accent) in enumerate(kpi_colors):
    c1, c2 = idx * 2, idx * 2 + 2
    style_reqs += [
        merge_cells(0, 3, 4, c1, c2),
        merge_cells(0, 4, 5, c1, c2),
        merge_cells(0, 5, 6, c1, c2),
        repeat_cell(0, 3, 6, c1, c2, {"backgroundColor": hex_to_rgb("#FFFFFF")}, "userEnteredFormat.backgroundColor"),
        repeat_cell(0, 3, 4, c1, c2, {
            "backgroundColor": hex_to_rgb(bg),
            "textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb(accent)},
            "horizontalAlignment": "CENTER",
        }),
        repeat_cell(0, 4, 5, c1, c2, {
            "textFormat": {"fontFamily": "Inter", "fontSize": 20, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")},
            "horizontalAlignment": "CENTER",
        }),
        repeat_cell(0, 5, 6, c1, c2, {
            "textFormat": {"fontFamily": "Inter", "fontSize": 8, "foregroundColor": hex_to_rgb("#64748B")},
            "horizontalAlignment": "CENTER",
        }),
        borders(0, 3, 6, c1, c2, color="#CBD5E1", style="SOLID", inner=False, outer=True),
    ]
# KPI Number formats
style_reqs += [
    repeat_cell(0, 4, 5, 6, 8, {"numberFormat": {"type": "NUMBER", "pattern": '#,##0.0" h"'}}, "userEnteredFormat.numberFormat"),
    repeat_cell(0, 4, 5, 8, 12, {"numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.numberFormat"),
]

# Goals & Wishlist Radar (rows 7..12)
style_reqs += section_bar(0, 7, 0, 6, "#4F46E5")
style_reqs += section_bar(0, 7, 7, 12, "#DB2777")
style_reqs.append(row_height(0, 8, 13, 26))
style_reqs.append(row_height(0, 13, 14, 12))
for r in range(8, 13):
    style_reqs += [
        merge_cells(0, r, r + 1, 0, 2),
        merge_cells(0, r, r + 1, 7, 10),
        merge_cells(0, r, r + 1, 10, 12),
    ]
    if r == 9:
        style_reqs.append(merge_cells(0, r, r + 1, 2, 6))
    else:
        style_reqs += [merge_cells(0, r, r + 1, 2, 4), merge_cells(0, r, r + 1, 4, 6)]

style_reqs += [
    repeat_cell(0, 8, 13, 0, 6, {"backgroundColor": hex_to_rgb("#FFFFFF")}, "userEnteredFormat.backgroundColor"),
    repeat_cell(0, 8, 13, 0, 2, {"textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#334155")}}, "userEnteredFormat.textFormat"),
    repeat_cell(0, 8, 13, 2, 6, {"horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat"),
    repeat_cell(0, 8, 9, 4, 6, {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}, "userEnteredFormat.numberFormat"),
    borders(0, 8, 13, 0, 6, color="#E2E8F0", inner=True, outer=True),
    repeat_cell(0, 8, 13, 7, 12, {"backgroundColor": hex_to_rgb("#FFFFFF")}, "userEnteredFormat.backgroundColor"),
    repeat_cell(0, 8, 13, 7, 10, {"textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#334155")}}, "userEnteredFormat.textFormat"),
    repeat_cell(0, 8, 13, 10, 12, {"horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat"),
    repeat_cell(0, 11, 13, 10, 12, {"numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.numberFormat"),
    borders(0, 8, 13, 7, 12, color="#E2E8F0", inner=True, outer=True),
]

# Top 5 Next Games & Hall of Fame (rows 14..20)
style_reqs += section_bar(0, 14, 0, 7, "#0EA5E9")
style_reqs += section_bar(0, 14, 7, 12, "#059669")
style_reqs += table_header_style(0, 15, 0, 7, "#1E293B")
style_reqs += table_header_style(0, 15, 7, 12, "#1E293B")
style_reqs += [
    merge_cells(0, 15, 16, 7, 9),
    merge_cells(0, 15, 16, 9, 11),
    row_height(0, 16, 21, 28),
    row_height(0, 21, 22, 12),
    repeat_cell(0, 16, 21, 0, 12, {"backgroundColor": hex_to_rgb("#FFFFFF")}, "userEnteredFormat.backgroundColor"),
    repeat_cell(0, 16, 21, 0, 1, {"horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#4F46E5")}}),
    repeat_cell(0, 16, 21, 1, 2, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.textFormat"),
    repeat_cell(0, 16, 21, 2, 7, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(0, 16, 21, 6, 7, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#059669")}, "numberFormat": {"type": "NUMBER", "pattern": "0.0"}}),
    borders(0, 15, 21, 0, 7, color="#CBD5E1", inner=True, outer=True),
]
for r in range(16, 21):
    style_reqs += [merge_cells(0, r, r + 1, 7, 9), merge_cells(0, r, r + 1, 9, 11)]
style_reqs += [
    repeat_cell(0, 16, 21, 7, 9, {"textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#334155")}}, "userEnteredFormat.textFormat"),
    repeat_cell(0, 16, 21, 9, 11, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.textFormat"),
    repeat_cell(0, 16, 21, 11, 12, {"horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#4F46E5")}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat"),
    borders(0, 15, 21, 7, 12, color="#CBD5E1", inner=True, outer=True),
]
# Charts section banner row 22
style_reqs += section_bar(0, 22, 0, 12, "#0F172A")
# Dashboard column widths
dash_widths = [50, 210, 115, 115, 85, 75, 75, 130, 105, 130, 100, 105]
for idx, w in enumerate(dash_widths):
    style_reqs.append(col_width(0, idx, idx + 1, w))

# --- STYLE BACKLOG (sheetId 10) ---
style_reqs += banner_style(10, 31, "#0F172A", split_col=3)
style_reqs += table_header_style(10, 1, 0, 31, "#1E293B")
style_reqs.append(row_height(10, 2, 18, 52))  # Cover art looks awesome at 52px!
style_reqs.append(row_height(10, 18, 100, 34))
# Subtle alternating rows on Backlog
for r in range(2, 100, 2):
    style_reqs.append(repeat_cell(10, r + 1, r + 2, 0, 31, {"backgroundColor": hex_to_rgb("#F8FAFC")}, "userEnteredFormat.backgroundColor"))
style_reqs.append(borders(10, 1, 100, 0, 31, color="#E2E8F0", inner=True, outer=True))
# Alignments & number formats on Backlog
style_reqs += [
    repeat_cell(10, 2, 100, 0, 2, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(10, 2, 100, 2, 3, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}, "wrapStrategy": "WRAP"}, "userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy"),
    repeat_cell(10, 2, 100, 3, 9, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(10, 2, 100, 8, 9, {"numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 9, 14, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0.0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 14, 15, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "PERCENT", "pattern": "0%"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 16, 17, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "PERCENT", "pattern": "0%"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 17, 18, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 18, 19, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0.0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 19, 21, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 21, 22, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(10, 2, 100, 22, 25, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 25, 26, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 26, 27, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0.0"}, "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#4F46E5")}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat,userEnteredFormat.textFormat"),
    repeat_cell(10, 2, 100, 27, 28, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(10, 2, 100, 29, 30, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(10, 2, 100, 30, 31, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
]
# Backlog column widths
bl_widths = [
    64, 102, 225, 138, 124, 126, 130, 120, 60,
    84, 88, 88, 86, 86, 80, 96, 98,
    78, 78, 96, 90, 120, 96, 96, 96, 84, 88, 92, 120, 90, 270
]
for idx, w in enumerate(bl_widths):
    style_reqs.append(col_width(10, idx, idx + 1, w))

# Data validations on Backlog
style_reqs += [
    validation_list(10, 2, 500, 3, 4, statuses),
    validation_list(10, 2, 500, 4, 5, ["🔥 1 - Urgente", "⭐ 2 - Alta", "👍 3 - Média", "🧊 4 - Baixa", "💤 5 - Talvez"]),
    validation_list(10, 2, 500, 5, 6, ["PC", "PS5", "PS4", "Xbox Series", "Xbox One", "Nintendo Switch", "Switch 2", "Steam Deck", "Mobile", "Retro / Emulador"]),
    validation_list(10, 2, 500, 6, 7, stores_list + ["Ubisoft", "EA App", "Battle.net"]),
    validation_list(10, 2, 500, 7, 8, genres_list + ["Corrida", "Luta", "Simulação", "Esporte", "Outro"]),
    validation_list(10, 2, 500, 21, 22, ["✅ Verified", "⚠️ Playable", "🏆 Platinum", "🥇 Gold", "🥈 Silver", "🥉 Bronze", "❌ Unsupported", "N/A"]),
]
# Conditional formatting pills on Backlog Status (col 3), Priority (col 4), Critic Score (col 17), Deck (col 21)
status_pills = [
    ("📌 Backlog", "#E0F2FE", "#0369A1"),
    ("🕹️ Jogando", "#EDE9FE", "#6D28D9"),
    ("⏸️ Pausado", "#FEF3C7", "#B45309"),
    ("✅ Zerado", "#D1FAE5", "#047857"),
    ("🏆 100% / Platina", "#FEF08A", "#854D0E"),
    ("♾️ Contínuo / MP", "#E0E7FF", "#3730A3"),
    ("💀 Dropado", "#FFE4E6", "#BE123C"),
    ("🔄 Rejogando", "#CCFBF1", "#0F766E"),
]
for txt, bg, fg in status_pills:
    style_reqs.append(cond_eq(10, 2, 500, 3, 4, txt, bg, fg))
for txt, bg, fg in [
    ("🔥 1 - Urgente", "#FEE2E2", "#B91C1C"),
    ("⭐ 2 - Alta", "#FEF3C7", "#B45309"),
    ("👍 3 - Média", "#E0F2FE", "#0369A1"),
    ("🧊 4 - Baixa", "#F1F5F9", "#475569"),
    ("💤 5 - Talvez", "#F8FAFC", "#94A3B8"),
]:
    style_reqs.append(cond_eq(10, 2, 500, 4, 5, txt, bg, fg))
style_reqs += [
    cond_num(10, 2, 500, 17, 18, "NUMBER_GREATER_THAN_EQ", [85], "#D1FAE5", "#065F46"),
    cond_num(10, 2, 500, 17, 18, "NUMBER_BETWEEN", [70, 84], "#FEF3C7", "#92400E"),
    cond_num(10, 2, 500, 17, 18, "NUMBER_LESS", [70], "#FFE4E6", "#9F1239"),
    cond_eq(10, 2, 500, 21, 22, "✅ Verified", "#D1FAE5", "#047857"),
    cond_eq(10, 2, 500, 21, 22, "🏆 Platinum", "#EDE9FE", "#5B21B6"),
    cond_eq(10, 2, 500, 21, 22, "🥇 Gold", "#FEF3C7", "#92400E"),
]

# --- STYLE WISHLIST (sheetId 20) ---
style_reqs += banner_style(20, 19, "#831843", split_col=2)
style_reqs += table_header_style(20, 1, 0, 19, "#9D174D")
style_reqs += [row_height(20, 2, 8, 52), row_height(20, 8, 60, 32)]
style_reqs.append(borders(20, 1, 60, 0, 19, color="#FBCFE8", inner=True, outer=True))
style_reqs += [
    repeat_cell(20, 2, 60, 0, 1, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 1, 2, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.textFormat"),
    repeat_cell(20, 2, 60, 2, 7, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 4, 5, {"numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}, "userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 7, 9, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 9, 10, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "PERCENT", "pattern": "0%"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 10, 12, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 12, 14, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 14, 15, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(20, 2, 60, 15, 18, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(20, 2, 60, 17, 18, {"numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}, "userEnteredFormat.numberFormat"),
    validation_list(20, 2, 300, 3, 4, ["🔥 Day One", "⭐ Quero Muito", "👍 Em Promoção", "👀 Observando"]),
    cond_eq(20, 2, 300, 13, 14, "🎯 COMPRAR AGORA!", "#D1FAE5", "#047857"),
    cond_eq(20, 2, 300, 13, 14, "🔥 MENOR HISTÓRICO", "#FEF3C7", "#B45309"),
    cond_eq(20, 2, 300, 13, 14, "💸 Ótima Promo (-50%+)", "#DBEAFE", "#1D4ED8"),
    cond_eq(20, 2, 300, 13, 14, "⏳ Aguardar", "#F1F5F9", "#64748B", bold=False),
]
wl_widths = [100, 220, 115, 125, 95, 82, 78, 96, 96, 76, 105, 96, 105, 150, 88, 86, 84, 98, 120]
for idx, w in enumerate(wl_widths):
    style_reqs.append(col_width(20, idx, idx + 1, w))

# --- STYLE SESSOES (sheetId 30) ---
style_reqs += banner_style(30, 10, "#064E3B")
style_reqs += table_header_style(30, 1, 0, 10, "#065F46")
style_reqs.append(row_height(30, 2, 60, 28))
style_reqs.append(borders(30, 1, 60, 0, 10, color="#A7F3D0", inner=True, outer=True))
style_reqs += [
    repeat_cell(30, 2, 60, 0, 1, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(30, 2, 60, 1, 2, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}, "userEnteredFormat.textFormat"),
    repeat_cell(30, 2, 60, 2, 9, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(30, 2, 60, 3, 4, {"numberFormat": {"type": "NUMBER", "pattern": "0.0"}}, "userEnteredFormat.numberFormat"),
    validation_range(30, 2, 500, 1, 2, "=Backlog!$C$3:$C$500"),
    validation_list(30, 2, 500, 5, 6, ["Não", "✅ Zerado", "🏆 100% / Platina"]),
    cond_eq(30, 2, 500, 5, 6, "✅ Zerado", "#D1FAE5", "#047857"),
    cond_eq(30, 2, 500, 5, 6, "🏆 100% / Platina", "#FEF08A", "#854D0E"),
]
for idx, w in enumerate([100, 220, 120, 75, 105, 130, 60, 65, 85, 340]):
    style_reqs.append(col_width(30, idx, idx + 1, w))

# --- STYLE GRATIS_ASSINATURAS (sheetId 40) ---
style_reqs += banner_style(40, 8, "#78350F")
style_reqs += [merge_cells(40, 1, 2, 0, 8), row_height(40, 1, 2, 24), repeat_cell(40, 1, 2, 0, 8, {"backgroundColor": hex_to_rgb("#FEF3C7"), "textFormat": {"fontFamily": "Inter", "fontSize": 9, "foregroundColor": hex_to_rgb("#78350F")}})]
style_reqs += section_bar(40, 2, 0, 8, "#D97706")
style_reqs += table_header_style(40, 3, 0, 8, "#1E293B")
style_reqs += section_bar(40, 10, 0, 8, "#0F172A")
style_reqs += table_header_style(40, 11, 0, 8, "#334155")
style_reqs += [
    row_height(40, 4, 9, 28),
    row_height(40, 12, 25, 52),
    repeat_cell(40, 12, 25, 0, 8, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
    repeat_cell(40, 8, 9, 0, 8, {"backgroundColor": hex_to_rgb("#FEF3C7"), "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(40, 4, 9, 2, 4, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(40, 4, 9, 4, 7, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(40, 4, 9, 7, 8, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    borders(40, 3, 9, 0, 8, color="#FDE68A", inner=True, outer=True),
    borders(40, 11, 25, 0, 8, color="#CBD5E1", inner=True, outer=True),
    validation_checkbox(40, 12, 35, 5, 6),
    cond_eq(40, 12, 35, 1, 2, "🟢 GRÁTIS AGORA", "#D1FAE5", "#047857"),
    cond_eq(40, 12, 35, 1, 2, "🟡 EM BREVE", "#FEF3C7", "#B45309"),
]
for idx, w in enumerate([230, 145, 120, 120, 115, 95, 145, 340]):
    style_reqs.append(col_width(40, idx, idx + 1, w))

# --- STYLE ANALISES (sheetId 50) ---
style_reqs += banner_style(50, 13, "#4C1D95")
style_reqs += [merge_cells(50, 1, 2, 0, 13), row_height(50, 1, 2, 24), repeat_cell(50, 1, 2, 0, 13, {"backgroundColor": hex_to_rgb("#F5F3FF"), "textFormat": {"fontFamily": "Inter", "fontSize": 9, "foregroundColor": hex_to_rgb("#5B21B6")}})]
style_reqs += section_bar(50, 2, 0, 6, "#6D28D9")
style_reqs += section_bar(50, 2, 7, 13, "#6D28D9")
style_reqs += table_header_style(50, 3, 0, 6, "#1E293B")
style_reqs += table_header_style(50, 3, 7, 13, "#1E293B")
style_reqs += section_bar(50, 14, 0, 6, "#0284C7")
style_reqs += table_header_style(50, 15, 0, 6, "#1E293B")
style_reqs += section_bar(50, 18, 7, 13, "#D97706")
style_reqs += table_header_style(50, 19, 7, 13, "#1E293B")
style_reqs += section_bar(50, 27, 0, 6, "#059669")
style_reqs += section_bar(50, 27, 7, 13, "#DB2777")
style_reqs += table_header_style(50, 28, 0, 6, "#1E293B")
style_reqs += table_header_style(50, 28, 7, 13, "#1E293B")
style_reqs += [
    repeat_cell(50, 4, 13, 1, 6, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(50, 4, 13, 2, 3, {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}, "userEnteredFormat.numberFormat"),
    repeat_cell(50, 4, 13, 5, 6, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(50, 12, 13, 0, 6, {"backgroundColor": hex_to_rgb("#EDE9FE"), "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(50, 16, 17, 7, 13, {"backgroundColor": hex_to_rgb("#EDE9FE"), "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(50, 4, 17, 8, 13, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(50, 4, 17, 11, 12, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(50, 16, 26, 1, 6, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(50, 16, 26, 3, 4, {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}, "userEnteredFormat.numberFormat"),
    repeat_cell(50, 16, 26, 5, 6, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(50, 20, 25, 8, 12, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(50, 24, 25, 7, 12, {"backgroundColor": hex_to_rgb("#FEF3C7"), "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(50, 29, 41, 1, 3, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(50, 29, 41, 3, 6, {"horizontalAlignment": "CENTER", "numberFormat": {"type": "NUMBER", "pattern": "0.0"}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    repeat_cell(50, 29, 41, 8, 11, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(50, 29, 41, 11, 13, {"horizontalAlignment": "RIGHT", "numberFormat": {"type": "CURRENCY", "pattern": '"R$ "#,##0.00'}}, "userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat"),
    borders(50, 3, 13, 0, 6, color="#DDD6FE", inner=True, outer=True),
    borders(50, 3, 17, 7, 13, color="#DDD6FE", inner=True, outer=True),
    borders(50, 15, 26, 0, 6, color="#BAE6FD", inner=True, outer=True),
    borders(50, 19, 25, 7, 12, color="#FDE68A", inner=True, outer=True),
    borders(50, 28, 41, 0, 6, color="#A7F3D0", inner=True, outer=True),
    borders(50, 28, 41, 7, 13, color="#FBCFE8", inner=True, outer=True),
]
for idx, w in enumerate([150, 68, 78, 95, 110, 105, 26, 150, 72, 82, 95, 105, 85]):
    style_reqs.append(col_width(50, idx, idx + 1, w))

# --- STYLE CONFIG_APIS (sheetId 60) ---
style_reqs += banner_style(60, 6, "#1E293B")
style_reqs += [merge_cells(60, 1, 2, 0, 6), row_height(60, 1, 2, 26), repeat_cell(60, 1, 2, 0, 6, {"backgroundColor": hex_to_rgb("#E2E8F0"), "textFormat": {"fontFamily": "Inter", "fontSize": 9, "foregroundColor": hex_to_rgb("#334155")}})]
style_reqs += section_bar(60, 3, 0, 6, "#4F46E5")
style_reqs += table_header_style(60, 4, 0, 6, "#334155")
style_reqs += section_bar(60, 15, 0, 6, "#0EA5E9")
style_reqs += table_header_style(60, 16, 0, 6, "#334155")
style_reqs += section_bar(60, 22, 0, 6, "#059669")
style_reqs += table_header_style(60, 23, 0, 6, "#334155")
style_reqs += [
    row_height(60, 5, 36, 36),
    repeat_cell(60, 5, 36, 2, 6, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
    repeat_cell(60, 5, 14, 1, 2, {"backgroundColor": hex_to_rgb("#EEF2FF"), "horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True, "foregroundColor": hex_to_rgb("#3730A3")}}),
    repeat_cell(60, 17, 21, 1, 3, {"backgroundColor": hex_to_rgb("#E0F2FE"), "horizontalAlignment": "CENTER", "numberFormat": {"type": "PERCENT", "pattern": "0%"}, "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(60, 24, 31, 1, 2, {"backgroundColor": hex_to_rgb("#FEFCE8"), "horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}),
    repeat_cell(60, 31, 36, 1, 2, {"backgroundColor": hex_to_rgb("#ECFDF5"), "horizontalAlignment": "CENTER", "textFormat": {"fontFamily": "Inter", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#047857")}}),
    repeat_cell(60, 5, 36, 0, 1, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}, "userEnteredFormat.textFormat"),
    repeat_cell(60, 5, 36, 5, 6, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    borders(60, 4, 14, 0, 6, color="#CBD5E1", inner=True, outer=True),
    borders(60, 16, 21, 0, 6, color="#CBD5E1", inner=True, outer=True),
    borders(60, 23, 36, 0, 6, color="#CBD5E1", inner=True, outer=True),
]
for idx, w in enumerate([245, 220, 165, 440, 195, 170]):
    style_reqs.append(col_width(60, idx, idx + 1, w))

# --- STYLE GUIA_FUNCOES (sheetId 70) ---
style_reqs += banner_style(70, 6, "#0F766E")
style_reqs += [merge_cells(70, 1, 2, 0, 6), row_height(70, 1, 2, 26), repeat_cell(70, 1, 2, 0, 6, {"backgroundColor": hex_to_rgb("#CCFBF1"), "textFormat": {"fontFamily": "Inter", "fontSize": 9, "foregroundColor": hex_to_rgb("#115E59")}})]
style_reqs += section_bar(70, 3, 0, 6, "#0D9488")
style_reqs += table_header_style(70, 4, 0, 6, "#1E293B")
for r in range(4, 9):
    style_reqs.append(merge_cells(70, r, r + 1, 2, 6))
style_reqs += section_bar(70, 10, 0, 6, "#4F46E5")
style_reqs += table_header_style(70, 11, 0, 6, "#1E293B")
style_reqs += section_bar(70, 29, 0, 6, "#D97706")
style_reqs += [
    merge_cells(70, 30, 31, 0, 6),
    row_height(70, 5, 9, 36),
    row_height(70, 12, 28, 34),
    row_height(70, 30, 31, 52),
    repeat_cell(70, 5, 28, 1, 6, {"wrapStrategy": "WRAP"}, "userEnteredFormat.wrapStrategy"),
    repeat_cell(70, 5, 9, 0, 1, {"horizontalAlignment": "CENTER", "backgroundColor": hex_to_rgb("#CCFBF1"), "textFormat": {"fontFamily": "Inter", "fontSize": 11, "bold": True, "foregroundColor": hex_to_rgb("#0F766E")}}),
    repeat_cell(70, 5, 9, 1, 2, {"textFormat": {"fontFamily": "Inter", "fontSize": 10, "bold": True}}, "userEnteredFormat.textFormat"),
    repeat_cell(70, 12, 28, 0, 1, {"textFormat": {"fontFamily": "Roboto Mono", "fontSize": 9, "bold": True, "foregroundColor": hex_to_rgb("#4338CA")}}, "userEnteredFormat.textFormat"),
    repeat_cell(70, 12, 28, 1, 2, {"textFormat": {"fontFamily": "Roboto Mono", "fontSize": 9, "foregroundColor": hex_to_rgb("#0F172A")}}, "userEnteredFormat.textFormat"),
    repeat_cell(70, 12, 28, 2, 4, {"horizontalAlignment": "CENTER"}, "userEnteredFormat.horizontalAlignment"),
    repeat_cell(70, 30, 31, 0, 6, {"backgroundColor": hex_to_rgb("#FEF3C7"), "wrapStrategy": "WRAP", "textFormat": {"fontFamily": "Inter", "fontSize": 10, "foregroundColor": hex_to_rgb("#78350F")}}),
    borders(70, 4, 9, 0, 6, color="#99F6E4", inner=True, outer=True),
    borders(70, 11, 28, 0, 6, color="#CBD5E1", inner=True, outer=True),
]
for idx, w in enumerate([165, 280, 150, 115, 440, 155]):
    style_reqs.append(col_width(70, idx, idx + 1, w))

with open(os.path.join(OUT_DIR, "03_style.json"), "w", encoding="utf-8") as f:
    json.dump({"requests": style_reqs}, f, ensure_ascii=False, indent=2)


# =====================================================================
# 4. 4 EMBEDDED CHARTS ON DASHBOARD (ZERO OVERLAP, CLEAN 2x2 GRID)
# =====================================================================
def make_bar_chart(title, src_sid, r1, r2, domain_c, series_list, anchor_r, anchor_c, width=590, height=310, chart_type="BAR", stacked="NOT_STACKED"):
    series = []
    for col_idx, color_hex in series_list:
        series.append({
            "series": {
                "sourceRange": {
                    "sources": [grid_range(src_sid, r1, r2, col_idx, col_idx + 1)]
                }
            },
            "color": hex_to_rgb(color_hex),
            "targetAxis": "BOTTOM_AXIS" if chart_type == "BAR" else "LEFT_AXIS",
        })
    return {
        "addChart": {
            "chart": {
                "spec": {
                    "title": title,
                    "titleTextFormat": {"fontFamily": "Inter", "fontSize": 12, "bold": True, "foregroundColor": hex_to_rgb("#0F172A")},
                    "backgroundColor": hex_to_rgb("#FFFFFF"),
                    "basicChart": {
                        "chartType": chart_type,
                        "legendPosition": "TOP_LEGEND" if len(series_list) > 1 else "NO_LEGEND",
                        "stackedType": stacked,
                        "headerCount": 1,
                        "domains": [
                            {
                                "domain": {
                                    "sourceRange": {
                                        "sources": [grid_range(src_sid, r1, r2, domain_c, domain_c + 1)]
                                    }
                                }
                            }
                        ],
                        "series": series,
                    },
                },
                "position": {
                    "overlayPosition": {
                        "anchorCell": {"sheetId": 0, "rowIndex": anchor_r, "columnIndex": anchor_c},
                        "offsetXPixels": 6,
                        "offsetYPixels": 6,
                        "widthPixels": width,
                        "heightPixels": height,
                    }
                },
            }
        }
    }

chart_reqs = [
    # Top-Left: Games by Status (Analises A4:B12 -> 0-indexed rows 3..12)
    make_bar_chart("Distribuição por Status", 50, 3, 12, 0, [(1, "#4F46E5")], 23, 0, width=630, height=320, chart_type="BAR"),
    # Top-Right: Platforms Total vs Beaten (Analises A16:C26 -> 0-indexed rows 15..26)
    make_bar_chart("Acervo vs. Zerados por Plataforma", 50, 15, 26, 0, [(1, "#0EA5E9"), (2, "#10B981")], 23, 6, width=630, height=320, chart_type="COLUMN"),
    # Bottom-Left: Monthly Evolution Beaten & Hours (Analises H4:K16 -> rows 3..16, col 7 domain, cols 8 & 10)
    make_bar_chart("Evolução Mensal (Zerados & Comprados)", 50, 3, 16, 7, [(8, "#10B981"), (9, "#F59E0B")], 40, 0, width=630, height=320, chart_type="COLUMN"),
    # Bottom-Right: HLTB Duration Bands Backlog vs Beaten (Analises H20:J24 -> rows 19..24, col 7 domain, cols 8 & 9)
    make_bar_chart("Duração HLTB: Backlog vs. Zerados", 50, 19, 24, 7, [(8, "#EC4899"), (9, "#10B981")], 40, 6, width=630, height=320, chart_type="COLUMN"),
]

with open(os.path.join(OUT_DIR, "04_charts.json"), "w", encoding="utf-8") as f:
    json.dump({"requests": chart_reqs}, f, ensure_ascii=False, indent=2)

print("Generated all 4 JSON files successfully in:", OUT_DIR)
