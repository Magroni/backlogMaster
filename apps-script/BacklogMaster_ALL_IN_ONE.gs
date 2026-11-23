/**
 * ============================================================================
 * 🎮 GAME BACKLOG MASTER — CORE, MENU, CONFIGURAÇÕES & CACHE
 * ============================================================================
 * Integrações: HowLongToBeat (auto-discovery + x-auth-token), Steam Web API,
 * Steam Store API, ProtonDB / Steam Deck, CheapShark, IsThereAnyDeal v2,
 * GOG Catalog API, Epic Games Freebies, RAWG.io e IGDB v4 (Twitch OAuth2).
 */

const SHEET_NAMES = {
  DASHBOARD: 'Dashboard',
  BACKLOG: 'Backlog',
  WISHLIST: 'Wishlist',
  SESSOES: 'Sessoes',
  GRATIS: 'Gratis_Assinaturas',
  ANALISES: 'Analises',
  CONFIG: 'Config_APIs',
  GUIA: 'Guia_Funcoes',
};

const CACHE_TTL_SECONDS = 21600; // 6 horas (máximo do CacheService)

/**
 * Cria o menu personalizado 🎮 Backlog Master ao abrir a planilha.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎮 Backlog Master')
    .addItem('✨ Abrir Assistente (Buscar + Roleta + Sessão)', 'openBacklogSidebar')
    .addSeparator()
    .addItem('⚡ Enriquecer Linha Selecionada (HLTB + Lojas + Metadados)', 'enrichSelectedBacklogRow')
    .addItem('🚀 Enriquecer Backlog em Lote (linhas sem dados)', 'enrichBacklogBatch')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('💨 Steam, Epic & Game Pass')
        .addItem('📥 Importar Minha Biblioteca Steam', 'importSteamLibrary')
        .addItem('🏷️ Importar Minha Wishlist Steam', 'importSteamWishlist')
        .addItem('🔄 Sincronizar Horas & Conquistas Steam', 'syncSteamPlaytimeAndAchievements')
        .addSeparator()
        .addItem('🎁 Buscar Jogos Grátis da Semana (Epic Games)', 'syncEpicFreeGames')
        .addItem('🚨 Checar "Saindo em Breve" no PC Game Pass', 'syncGamePassLeavingSoon')
        .addItem('✅ Cruzar Wishlist com PC Game Pass', 'checkWishlistAgainstGamePass')
    )
    .addSubMenu(
      ui.createMenu('🏷️ Radar de Preços & Alertas')
        .addItem('🔄 Atualizar Preços da Wishlist (Steam/CheapShark/ITAD/GOG/GP)', 'updateAllWishlistPrices')
        .addItem('📧 Enviar E-mail com Ofertas Ativas da Wishlist', 'sendWishlistDealsEmail')
    )
    .addSeparator()
    .addItem('🎲 Roleta Rápida — O Que Jogar Agora?', 'quickBacklogRoulette')
    .addItem('⏱️ Registrar Sessão de Jogo (Rápido)', 'promptLogSession')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('⚙️ Automação & Diagnóstico')
        .addItem('⏰ Ativar Atualização Diária Automática (08h)', 'installDailyTriggers')
        .addItem('🛑 Desativar Atualização Automática', 'removeAllTriggers')
        .addItem('🔧 Testar Conexões das APIs', 'testAllApiConnections')
        .addItem('🧹 Limpar Cache das APIs', 'clearApiCache')
    )
    .addToUi();
}

/**
 * Abre a barra lateral interativa (Sidebar.html).
 */
function openBacklogSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('🎮 Backlog Master')
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Lê todas as configurações da aba Config_APIs (com cache em memória por execução).
 */
let _configMemo = null;
function getConfig() {
  if (_configMemo) return _configMemo;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (!sh) {
    return {
      metaAnual: 20, horasSemana: 12, anoRef: new Date().getFullYear(),
      country: 'BR', currency: 'BRL', usdToBrl: 5.8, alertEmail: '',
      includeF2P: true, hltbMode: 1, steamApiKey: '', steamId: '',
      rawgApiKey: '', igdbClientId: '', igdbClientSecret: '',
      itadApiKey: '', hltbEndpointOverride: '',
    };
  }
  const vals = sh.getRange('B6:B31').getValues().map(r => (r[0] !== null && r[0] !== undefined ? String(r[0]).trim() : ''));
  _configMemo = {
    metaAnual: Number(vals[0]) || 20,          // B6
    horasSemana: Number(vals[1]) || 12,        // B7
    anoRef: Number(vals[2]) || new Date().getFullYear(), // B8
    country: (vals[3] || 'BR').toUpperCase(),  // B9
    currency: (vals[4] || 'BRL').toUpperCase(),// B10
    usdToBrl: Number(vals[5].replace(',', '.')) || 5.8, // B11
    alertEmail: vals[6] || '',                 // B12
    includeF2P: (vals[7] || 'SIM').toUpperCase() !== 'NÃO' && (vals[7] || 'SIM').toUpperCase() !== 'NAO', // B13
    hltbMode: Number(vals[8]) || 1,            // B14
    steamApiKey: vals[19] || '',               // B25
    steamId: vals[20] || '',                   // B26
    rawgApiKey: vals[21] || '',                // B27
    igdbClientId: vals[22] || '',              // B28
    igdbClientSecret: vals[23] || '',          // B29
    itadApiKey: vals[24] || '',                // B30
    hltbEndpointOverride: vals[25] || '',      // B31
  };
  return _configMemo;
}

/**
 * Helpers de cache (6h) com hash seguro para chaves longas.
 */
function cacheGetJson(key) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(makeCacheKey_(key));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function cachePutJson(key, obj, ttl) {
  try {
    const str = JSON.stringify(obj);
    if (str.length < 95000) {
      CacheService.getScriptCache().put(makeCacheKey_(key), str, ttl || CACHE_TTL_SECONDS);
    }
  } catch (e) {
    // Ignora se exceder limite do cache
  }
}

function makeCacheKey_(key) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(key));
  const hex = bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  return 'bm_' + hex;
}

function clearApiCache() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('HLTB_DISCOVERED_ENDPOINT');
  props.deleteProperty('IGDB_ACCESS_TOKEN');
  props.deleteProperty('IGDB_TOKEN_EXPIRY');
  SpreadsheetApp.getActiveSpreadsheet().toast('Cache interno e tokens temporários limpos com sucesso!', '🧹 Cache Limpo', 4);
}

/**
 * Normaliza título para comparação fuzzy entre lojas/APIs.
 */
function normalizeTitle_(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©:'".,!?()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula similaridade (0..1) entre dois títulos de jogos.
 */
function titleSimilarity_(a, b) {
  const na = normalizeTitle_(a);
  const nb = normalizeTitle_(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (nb.startsWith(na) || na.startsWith(nb)) {
    return 0.85 * (Math.min(na.length, nb.length) / Math.max(na.length, nb.length)) + 0.12;
  }
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? inter / union : 0;
}

/**
 * Converte USD -> moeda configurada (se BRL, usa cotação do Config_APIs).
 */
function convertUsdToLocal_(usdAmount) {
  if (usdAmount === null || usdAmount === undefined || isNaN(Number(usdAmount))) return '';
  const cfg = getConfig();
  const val = Number(usdAmount);
  if (cfg.currency === 'USD') return Math.round(val * 100) / 100;
  return Math.round(val * cfg.usdToBrl * 100) / 100;
}

/**
 * Mapeia gêneros em inglês retornados pelas APIs para os gêneros padronizados da planilha.
 */
function mapGenrePt_(rawGenre) {
  const g = String(rawGenre || '').toLowerCase();
  if (g.includes('metroidvania')) return 'Metroidvania';
  if (g.includes('roguelike') || g.includes('roguelite')) return 'Roguelike';
  if (g.includes('jrpg')) return 'JRPG';
  if (g.includes('rpg') || g.includes('role-playing') || g.includes('souls')) return 'RPG de Ação';
  if (g.includes('shooter') || g.includes('fps')) return 'FPS';
  if (g.includes('horror') || g.includes('terror')) return 'Terror';
  if (g.includes('platform')) return 'Plataforma';
  if (g.includes('strategy') || g.includes('estrat') || g.includes('tactical')) return 'Estratégia';
  if (g.includes('puzzle') || g.includes('quebra')) return 'Puzzle';
  if (g.includes('racing') || g.includes('corrida')) return 'Corrida';
  if (g.includes('fighting') || g.includes('luta')) return 'Luta';
  if (g.includes('simulation') || g.includes('simul')) return 'Simulação';
  if (g.includes('sport') || g.includes('esport')) return 'Esporte';
  if (g.includes('open world') || g.includes('mundo aberto')) return 'Mundo Aberto';
  if (g.includes('indie')) return 'Indie';
  if (g.includes('adventure') || g.includes('aventura') || g.includes('action') || g.includes('ação')) return 'Aventura';
  return rawGenre || 'Aventura';
}

/**
 * Fetch seguro com JSON parse e tratamento de erros.
 */
function safeFetchJson_(url, options) {
  try {
    const opts = Object.assign({ muteHttpExceptions: true, followRedirects: true }, options || {});
    const res = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code >= 200 && code < 300) {
      return { ok: true, code: code, data: JSON.parse(text), headers: res.getAllHeaders() };
    }
    return { ok: false, code: code, error: text.slice(0, 300), headers: res.getAllHeaders() };
  } catch (e) {
    return { ok: false, code: 0, error: String(e) };
  }
}


/**
 * ============================================================================
 * ⏱️ HOWLONGTOBEAT (HLTB) — ENGINE RESILIENTE + FÓRMULAS PERSONALIZADAS
 * ============================================================================
 * Estratégia em 3 camadas:
 *  1) Verifica se existe override manual em Config_APIs!B31.
 *  2) Descobre dinamicamente o endpoint ativo no bundle JS do HLTB + inicializa
 *     sessão via /init (obtendo cookies, x-auth-token e campos honeypot hpKey/hpVal).
 *  3) Tenta rotas padrão conhecidas (/api/find, /api/search) com User-Agent fixo
 *     por sessão para evitar HTTP 403.
 */

const HLTB_BASE = 'https://howlongtobeat.com';
const HLTB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Busca os dados do jogo no HowLongToBeat (com cache de 6h).
 * @param {string} gameTitle Nome do jogo
 * @return {Object|null} { id, name, main, extra, completionist, reviewScore, year, coverUrl, url }
 */
function hltbSearchGame(gameTitle) {
  if (!gameTitle) return null;
  const clean = String(gameTitle).trim();
  const cacheKey = 'hltb_v2_' + normalizeTitle_(clean);
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const candidateEndpoints = [];
  if (cfg.hltbEndpointOverride) {
    candidateEndpoints.push(cfg.hltbEndpointOverride.replace(/^\//, ''));
  }

  const discovered = discoverHltbEndpoint_();
  if (discovered && candidateEndpoints.indexOf(discovered) === -1) {
    candidateEndpoints.push(discovered);
  }
  ['api/find', 'api/search', 'api/s'].forEach(ep => {
    if (candidateEndpoints.indexOf(ep) === -1) candidateEndpoints.push(ep);
  });

  for (let i = 0; i < candidateEndpoints.length; i++) {
    const ep = candidateEndpoints[i];
    const result = executeHltbQuery_(ep, clean);
    if (result) {
      cachePutJson(cacheKey, result);
      return result;
    }
  }
  return null;
}

/**
 * Descobre o caminho dinâmico da API de busca a partir do HTML/JS do HLTB.
 */
function discoverHltbEndpoint_() {
  const props = PropertiesService.getScriptProperties();
  const cachedEp = cacheGetJson('hltb_discovered_ep');
  if (cachedEp && cachedEp.endpoint) return cachedEp.endpoint;

  try {
    const homeRes = UrlFetchApp.fetch(HLTB_BASE + '/', {
      muteHttpExceptions: true,
      headers: { 'User-Agent': HLTB_UA },
    });
    if (homeRes.getResponseCode() !== 200) return props.getProperty('HLTB_DISCOVERED_ENDPOINT') || 'api/find';
    const html = homeRes.getContentText();

    // Extrai scripts Next.js (_next/static/chunks/...)
    const scriptMatches = html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || [];
    const prioritized = scriptMatches.filter(s => s.includes('_app') || s.includes('main') || s.includes('pages'));
    const scriptsToCheck = prioritized.concat(scriptMatches).slice(0, 8);

    for (let i = 0; i < scriptsToCheck.length; i++) {
      const jsRes = UrlFetchApp.fetch(HLTB_BASE + scriptsToCheck[i], {
        muteHttpExceptions: true,
        headers: { 'User-Agent': HLTB_UA, 'Referer': HLTB_BASE + '/' },
      });
      if (jsRes.getResponseCode() !== 200) continue;
      const js = jsRes.getContentText();

      // Padrão 1: fetch("/api/find/" + "hash"...) ou fetch("/api/search/...")
      const m1 = js.match(/fetch\s*\(\s*["'`]\/(api\/(?:find|search|s)[^"'`]*?)["'`]/);
      if (m1 && m1[1]) {
        const ep = m1[1].replace(/\/+$/, '');
        cachePutJson('hltb_discovered_ep', { endpoint: ep }, CACHE_TTL_SECONDS);
        props.setProperty('HLTB_DISCOVERED_ENDPOINT', ep);
        return ep;
      }
      // Padrão 2: concatenação "/api/find/".concat("abc").concat("def")
      const m2 = js.match(/["']\/(api\/(?:find|search|s)\/?)["']\.concat\(([^)]+)\)/);
      if (m2) {
        const parts = m2[2].match(/["']([^"']+)["']/g) || [];
        const suffix = parts.map(p => p.slice(1, -1)).join('');
        const ep = (m2[1] + suffix).replace(/\/+/g, '/').replace(/\/$/, '');
        cachePutJson('hltb_discovered_ep', { endpoint: ep }, CACHE_TTL_SECONDS);
        props.setProperty('HLTB_DISCOVERED_ENDPOINT', ep);
        return ep;
      }
    }
  } catch (e) {
    Logger.log('HLTB discovery warning: ' + e);
  }
  return props.getProperty('HLTB_DISCOVERED_ENDPOINT') || 'api/find';
}

/**
 * Executa a inicialização (/init para x-auth-token + honeypot) e o POST de busca.
 */
function executeHltbQuery_(endpointPath, gameTitle) {
  const basePath = endpointPath.split('/').slice(0, 2).join('/'); // ex: api/find
  const headers = {
    'User-Agent': HLTB_UA,
    'Referer': HLTB_BASE + '/',
    'Origin': HLTB_BASE,
    'Accept': '*/*',
    'Content-Type': 'application/json',
  };

  let hpKey = null;
  let hpVal = null;

  // Etapa 1: Init token + cookies + honeypot (ex: /api/find/init?t=...)
  try {
    const initUrl = HLTB_BASE + '/' + basePath + '/init?t=' + Date.now();
    const initRes = UrlFetchApp.fetch(initUrl, {
      method: 'get',
      headers: {
        'User-Agent': HLTB_UA,
        'Referer': HLTB_BASE + '/',
        'Origin': HLTB_BASE,
      },
      muteHttpExceptions: true,
    });
    if (initRes.getResponseCode() === 200) {
      const initHeaders = initRes.getAllHeaders();
      const setCookies = initHeaders['Set-Cookie'] || initHeaders['set-cookie'];
      if (setCookies) {
        const list = Array.isArray(setCookies) ? setCookies : [setCookies];
        headers['Cookie'] = list.map(c => c.split(';')[0]).join('; ');
      }
      try {
        const initJson = JSON.parse(initRes.getContentText());
        if (initJson.token) headers['x-auth-token'] = initJson.token;
        if (initJson.hpKey && initJson.hpVal) {
          hpKey = initJson.hpKey;
          hpVal = initJson.hpVal;
          headers['x-hp-key'] = hpKey;
          headers['x-hp-val'] = hpVal;
        }
      } catch (parseErr) {}
    }
  } catch (e) {
    Logger.log('HLTB init warning: ' + e);
  }

  // Etapa 2: Monta payload de busca
  const terms = String(gameTitle)
    .replace(/[™®©:]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const payload = {
    searchType: 'games',
    searchTerms: terms,
    searchPage: 1,
    size: 15,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };

  if (hpKey && hpVal) {
    payload[hpKey] = hpVal;
  }

  const res = safeFetchJson_(HLTB_BASE + '/' + endpointPath, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
  });

  if (!res.ok || !res.data || !Array.isArray(res.data.data) || res.data.data.length === 0) {
    return null;
  }

  // Escolhe o jogo com maior similaridade de título
  let best = res.data.data[0];
  let bestScore = -1;
  res.data.data.forEach(item => {
    const sim = titleSimilarity_(gameTitle, item.game_name);
    const popBonus = item.comp_all_count > 50 ? 0.05 : 0;
    if (sim + popBonus > bestScore) {
      bestScore = sim + popBonus;
      best = item;
    }
  });

  const toHours = sec => (sec && sec > 0 ? Math.round((sec / 3600) * 10) / 10 : '');

  return {
    id: best.game_id,
    name: best.game_name,
    main: toHours(best.comp_main),
    extra: toHours(best.comp_plus),
    completionist: toHours(best.comp_100),
    allStyles: toHours(best.comp_all),
    reviewScore: best.review_score || '',
    year: best.release_world || '',
    coverUrl: best.game_image ? 'https://howlongtobeat.com/games/' + best.game_image : '',
    url: 'https://howlongtobeat.com/game/' + best.game_id,
  };
}

// ============================================================================
// FÓRMULAS PERSONALIZADAS DO GOOGLE SHEETS (HOWLONGTOBEAT)
// ============================================================================

/**
 * Retorna a duração da História Principal (em horas) no HowLongToBeat.
 * @param {string} titulo Nome do jogo (ex: "Elden Ring")
 * @return {number|string} Horas estimadas
 * @customfunction
 */
function HLTB_MAIN(titulo) {
  if (!titulo) return '';
  const g = hltbSearchGame(titulo);
  return g && g.main !== '' ? g.main : 'Não encontrado';
}

/**
 * Retorna a duração Principal + Extras (em horas) no HowLongToBeat.
 * @param {string} titulo Nome do jogo (ex: "Elden Ring")
 * @return {number|string} Horas estimadas
 * @customfunction
 */
function HLTB_EXTRA(titulo) {
  if (!titulo) return '';
  const g = hltbSearchGame(titulo);
  return g && g.extra !== '' ? g.extra : (g && g.main !== '' ? g.main : 'Não encontrado');
}

/**
 * Retorna a duração Complecionista / 100% (em horas) no HowLongToBeat.
 * @param {string} titulo Nome do jogo (ex: "Elden Ring")
 * @return {number|string} Horas estimadas
 * @customfunction
 */
function HLTB_COMP(titulo) {
  if (!titulo) return '';
  const g = hltbSearchGame(titulo);
  return g && g.completionist !== '' ? g.completionist : 'Não encontrado';
}

/**
 * Retorna uma linha com [Main, Main+Extra, 100%, Link HLTB] de uma só vez.
 * @param {string} titulo Nome do jogo
 * @return {Array<Array>} 4 colunas: Main, Extra, 100%, URL
 * @customfunction
 */
function HLTB_ALL(titulo) {
  if (!titulo) return [['', '', '', '']];
  const g = hltbSearchGame(titulo);
  if (!g) return [['Não encontrado', '', '', '']];
  return [[g.main, g.extra, g.completionist, g.url]];
}


/**
 * ============================================================================
 * 💨 STEAM STORE API + STEAM WEB API + PROTONDB / STEAM DECK
 * ============================================================================
 * - Steam Store API & ProtonDB funcionam SEM CHAVE!
 * - Importação de biblioteca e conquistas usam Steam Web API Key + SteamID64
 *   configurados na aba Config_APIs.
 */

/**
 * Procura o Steam AppID pelo nome do jogo (sem precisar de chave!).
 */
function steamFindAppId(title) {
  if (!title) return null;
  const raw = String(title).trim();
  if (/^\d+$/.test(raw)) return Number(raw);

  const cacheKey = 'steam_appid_' + normalizeTitle_(raw);
  const cached = cacheGetJson(cacheKey);
  if (cached && cached.appid) return cached.appid;

  const cfg = getConfig();
  const url = 'https://store.steampowered.com/api/storesearch/?term=' +
    encodeURIComponent(raw) + '&l=brazilian&cc=' + encodeURIComponent(cfg.country);
  const res = safeFetchJson_(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.items) || res.data.items.length === 0) {
    return null;
  }

  let best = res.data.items[0];
  let bestScore = -1;
  res.data.items.forEach(item => {
    const sim = titleSimilarity_(raw, item.name);
    if (sim > bestScore) {
      bestScore = sim;
      best = item;
    }
  });

  cachePutJson(cacheKey, { appid: best.id, name: best.name });
  return best.id;
}

/**
 * Busca detalhes completos na Steam Store API (preço BRL, desconto, capa,
 * Metacritic, gênero, ano de lançamento, desenvolvedora).
 */
function steamGetAppDetails(appIdOrTitle) {
  const appId = steamFindAppId(appIdOrTitle);
  if (!appId) return null;

  const cfg = getConfig();
  const cacheKey = 'steam_det_' + appId + '_' + cfg.country;
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  const url = 'https://store.steampowered.com/api/appdetails?appids=' + appId +
    '&cc=' + encodeURIComponent(cfg.country) + '&l=brazilian';
  const res = safeFetchJson_(url);
  if (!res.ok || !res.data || !res.data[String(appId)] || !res.data[String(appId)].success) {
    return null;
  }

  const d = res.data[String(appId)].data;
  const po = d.price_overview || null;
  const isFree = Boolean(d.is_free);

  let releaseYear = '';
  if (d.release_date && d.release_date.date) {
    const ym = String(d.release_date.date).match(/\b(19|20)\d{2}\b/);
    if (ym) releaseYear = Number(ym[0]);
  }

  const genres = Array.isArray(d.genres) ? d.genres.map(g => g.description) : [];
  const mainGenre = genres.length > 0 ? mapGenrePt_(genres[0]) : '';

  const info = {
    appId: Number(appId),
    name: d.name || '',
    isFree: isFree,
    initialPrice: po ? po.initial / 100 : (isFree ? 0 : ''),
    finalPrice: po ? po.final / 100 : (isFree ? 0 : ''),
    discountPercent: po ? (po.discount_percent || 0) / 100 : 0,
    currency: po ? po.currency : cfg.currency,
    metacritic: d.metacritic && d.metacritic.score ? Number(d.metacritic.score) : '',
    genre: mainGenre,
    allGenres: genres.join(', '),
    year: releaseYear,
    developers: Array.isArray(d.developers) ? d.developers.join(', ') : '',
    coverUrl: d.header_image || ('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/' + appId + '/header.jpg'),
    storeUrl: 'https://store.steampowered.com/app/' + appId,
  };

  cachePutJson(cacheKey, info);
  return info;
}

/**
 * Busca % de avaliações positivas na Steam (via IUserReviewsService oficial).
 */
function steamGetReviewPercent(appId) {
  if (!appId) return '';
  const cacheKey = 'steam_rev_' + appId;
  const cached = cacheGetJson(cacheKey);
  if (cached && cached.pct !== undefined) return cached.pct;

  const cfg = getConfig();
  let url = 'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?appid=' +
    encodeURIComponent(appId) + '&filter=all&language=all&num_per_page=0&json=1';
  if (cfg.steamApiKey) url += '&key=' + encodeURIComponent(cfg.steamApiKey);

  const res = safeFetchJson_(url);
  if (res.ok && res.data && res.data.query_summary && res.data.query_summary.total_reviews > 0) {
    const qs = res.data.query_summary;
    const pct = Math.round((qs.total_positive / qs.total_reviews) * 100);
    cachePutJson(cacheKey, { pct: pct });
    return pct;
  }
  return '';
}

/**
 * Consulta ProtonDB API (pública, sem chave!) para classificação Steam Deck / Linux.
 */
function protonDbGetTier(appIdOrTitle) {
  const appId = steamFindAppId(appIdOrTitle);
  if (!appId) return '';

  const cacheKey = 'protondb_' + appId;
  const cached = cacheGetJson(cacheKey);
  if (cached && cached.badge) return cached.badge;

  const url = 'https://www.protondb.com/api/v1/reports/summaries/' + appId + '.json';
  const res = safeFetchJson_(url, {
    headers: { 'User-Agent': 'GameBacklogMaster/2.0' },
  });
  if (!res.ok || !res.data || !res.data.tier) return '';

  const tierMap = {
    native: '✅ Verified',
    platinum: '🏆 Platinum',
    gold: '🥇 Gold',
    silver: '🥈 Silver',
    bronze: '🥉 Bronze',
    borked: '❌ Unsupported',
  };
  const badge = tierMap[String(res.data.tier).toLowerCase()] || '⚠️ Playable';
  cachePutJson(cacheKey, { badge: badge, rawTier: res.data.tier });
  return badge;
}

/**
 * Importa toda a biblioteca Steam do usuário para a aba Backlog (sem duplicar).
 */
function importSteamLibrary() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig();
  if (!cfg.steamApiKey || !cfg.steamId) {
    ui.alert(
      '🔑 Configuração Necessária',
      'Preencha sua "Steam Web API Key" (B25) e seu "SteamID64" (B26) na aba Config_APIs primeiro.\n\nLembre-se de deixar "Detalhes dos jogos" como Público na privacidade do seu perfil Steam.',
      ui.ButtonSet.OK
    );
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Conectando à Steam Web API...', '💨 Importando Steam', 5);

  const url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/' +
    '?key=' + encodeURIComponent(cfg.steamApiKey) +
    '&steamid=' + encodeURIComponent(cfg.steamId) +
    '&include_appinfo=1&include_played_free_games=' + (cfg.includeF2P ? '1' : '0') +
    '&format=json';

  const res = safeFetchJson_(url);
  if (!res.ok || !res.data || !res.data.response || !Array.isArray(res.data.response.games)) {
    ui.alert('❌ Erro na Steam API', 'Não foi possível ler sua biblioteca. Verifique sua API Key, SteamID64 e se o perfil/jogos está Público.\n\nDetalhes: ' + (res.error || 'Resposta vazia'), ui.ButtonSet.OK);
    return;
  }

  const games = res.data.response.games;
  games.sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));

  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const lastRow = Math.max(2, sh.getLastRow());
  const existingData = lastRow > 2 ? sh.getRange(3, 1, lastRow - 2, 31).getValues() : [];

  const existingAppIds = new Set();
  const existingTitles = new Set();
  let firstEmptyRow = 3;

  for (let i = 0; i < existingData.length; i++) {
    const title = String(existingData[i][2] || '').trim();
    const appid = String(existingData[i][27] || '').trim();
    if (title) {
      existingTitles.add(normalizeTitle_(title));
      firstEmptyRow = i + 4;
    }
    if (appid) existingAppIds.add(appid);
  }

  let added = 0;
  let skipped = 0;
  const today = new Date();
  const rowsToWrite = [];

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const idStr = String(g.appid);
    const norm = normalizeTitle_(g.name);
    if (existingAppIds.has(idStr) || existingTitles.has(norm)) {
      skipped++;
      continue;
    }

    const hours = Math.round(((g.playtime_forever || 0) / 60) * 10) / 10;
    const status = hours >= 1 ? '⏸️ Pausado' : '📌 Backlog';
    const cover = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/' + g.appid + '/header.jpg';
    const r = firstEmptyRow + rowsToWrite.length;

    rowsToWrite.push([
      `=IF(C${r}="","","G-"&TEXT(ROW()-2,"000"))`,
      `=IF(AC${r}="","",IMAGE(AC${r},1))`,
      g.name,
      status,
      '👍 3 - Média',
      'PC',
      'Steam',
      '', // Gênero (preenchido no enriquecimento)
      '', // Ano
      '', '', '', // HLTB
      hours,
      buildRemainingFormula_(r),
      buildProgressFormula_(r),
      buildSparklineFormula_(r),
      '', '', '', '', // Conquistas, Crítica, Minha Nota, Preço
      buildCostPerHourFormula_(r),
      '', // Deck/ProtonDB
      today, '', '',
      `=IF(AND(ISNUMBER(X${r}),ISNUMBER(Y${r})),MAX(1,Y${r}-X${r}),"")`,
      buildScoreFormula_(r),
      g.appid,
      cover,
      `=IF(C${r}="","",HYPERLINK("https://howlongtobeat.com/?q="&ENCODEURL(C${r}),"⏱️ HLTB"))`,
      'Importado via Steam API'
    ]);
    added++;
  }

  if (rowsToWrite.length > 0) {
    ensureSheetRows_(sh, firstEmptyRow + rowsToWrite.length + 5);
    sh.getRange(firstEmptyRow, 1, rowsToWrite.length, 31).setValues(rowsToWrite);
    sh.setRowHeights(firstEmptyRow, rowsToWrite.length, 52);
  }

  ui.alert(
    '✅ Biblioteca Steam Importada!',
    `Jogos encontrados na Steam: ${games.length}\nNovos adicionados ao Backlog: ${added}\nJá existentes (pulados): ${skipped}\n\nDica: Agora rode "🚀 Enriquecer Backlog em Lote" para preencher HLTB, Gêneros, Notas e ProtonDB automaticamente!`,
    ui.ButtonSet.OK
  );
}

/**
 * Sincroniza horas jogadas e % de conquistas de todos os jogos da aba Backlog que possuem Steam AppID.
 */
function syncSteamPlaytimeAndAchievements() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig();
  if (!cfg.steamApiKey || !cfg.steamId) {
    ui.alert('🔑 Faltam Credenciais', 'Configure Steam Web API Key (B25) e SteamID64 (B26) na aba Config_APIs.', ui.ButtonSet.OK);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Sincronizando horas e conquistas da Steam...', '🔄 Sync Steam', 5);

  const ownedUrl = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/' +
    '?key=' + encodeURIComponent(cfg.steamApiKey) +
    '&steamid=' + encodeURIComponent(cfg.steamId) +
    '&include_played_free_games=1&format=json';
  const ownedRes = safeFetchJson_(ownedUrl);
  const playtimeMap = {};
  if (ownedRes.ok && ownedRes.data && ownedRes.data.response && Array.isArray(ownedRes.data.response.games)) {
    ownedRes.data.response.games.forEach(g => {
      playtimeMap[String(g.appid)] = Math.round(((g.playtime_forever || 0) / 60) * 10) / 10;
    });
  }

  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return;
  const data = sh.getRange(3, 1, lastRow - 2, 28).getValues();

  let updatedHours = 0;
  let updatedAch = 0;
  const startTime = Date.now();

  for (let i = 0; i < data.length; i++) {
    if (Date.now() - startTime > 250000) break; // Segurança contra timeout
    const title = data[i][2];
    const appId = String(data[i][27] || '').trim();
    if (!title || !appId) continue;

    const rowNum = i + 3;
    if (playtimeMap[appId] !== undefined && playtimeMap[appId] !== data[i][12]) {
      sh.getRange(rowNum, 13).setValue(playtimeMap[appId]);
      updatedHours++;
    }

    // Conquistas via ISteamUserStats/GetPlayerAchievements/v1/
    const achUrl = 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/' +
      '?appid=' + encodeURIComponent(appId) +
      '&key=' + encodeURIComponent(cfg.steamApiKey) +
      '&steamid=' + encodeURIComponent(cfg.steamId);
    const achRes = safeFetchJson_(achUrl);
    if (achRes.ok && achRes.data && achRes.data.playerstats && Array.isArray(achRes.data.playerstats.achievements)) {
      const list = achRes.data.playerstats.achievements;
      if (list.length > 0) {
        const unlocked = list.filter(a => a.achieved === 1).length;
        const pct = Math.round((unlocked / list.length) * 1000) / 1000;
        sh.getRange(rowNum, 17).setValue(pct);
        updatedAch++;
      }
    }
    Utilities.sleep(150);
  }

  ss.toast(`Horas atualizadas: ${updatedHours} | Conquistas atualizadas: ${updatedAch}`, '✅ Sync Steam Concluído', 6);
}

/**
 * Importa sua Lista de Desejos (Wishlist) da Steam via IWishlistService/GetWishlist/v1/
 * para a aba Wishlist, já puxando preços em BRL, capa e checando se está no PC Game Pass!
 */
function importSteamWishlist() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig();
  if (!cfg.steamId) {
    ui.alert(
      '🔑 SteamID64 Necessário',
      'Preencha seu SteamID64 (B26) e sua Steam Web API Key (B25) na aba Config_APIs (perfil público) para importar sua Wishlist da Steam.',
      ui.ButtonSet.OK
    );
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Buscando sua Wishlist na Steam...', '🏷️ Importando Wishlist Steam', 5);

  let url = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=' + encodeURIComponent(cfg.steamId);
  if (cfg.steamApiKey) url += '&key=' + encodeURIComponent(cfg.steamApiKey);

  const res = safeFetchJson_(url);
  const items = res.ok && res.data && res.data.response && Array.isArray(res.data.response.items)
    ? res.data.response.items
    : [];

  if (items.length === 0) {
    ui.alert('⚠️ Wishlist Vazia ou Privada', 'Não foram encontrados itens na sua Wishlist Steam. Verifique o SteamID64 e se "Detalhes dos jogos" está Público.', ui.ButtonSet.OK);
    return;
  }

  items.sort((a, b) => (a.priority || 9999) - (b.priority || 9999));

  const sh = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  const lastRow = Math.max(2, sh.getLastRow());
  const existing = lastRow > 2 ? sh.getRange(3, 1, lastRow - 2, 20).getValues() : [];
  const existingAppIds = new Set();
  let nextRow = 3;
  existing.forEach((row, idx) => {
    if (row[1]) nextRow = idx + 4;
    if (row[16]) existingAppIds.add(String(row[16]).trim());
  });

  let added = 0;
  const startTime = Date.now();
  const today = new Date();

  for (let i = 0; i < items.length; i++) {
    if (Date.now() - startTime > 240000) break;
    const appId = String(items[i].appid);
    if (existingAppIds.has(appId)) continue;

    const det = steamGetAppDetails(appId);
    if (!det || !det.name) continue;

    const gpStatus = gamePassCheckTitle(det.name);
    const r = nextRow;
    ensureSheetRows_(sh, r + 5);

    sh.getRange(r, 1, 1, 20).setValues([[
      `=IF(T${r}="","",IMAGE(T${r},1))`,
      det.name,
      'PC',
      items[i].priority && items[i].priority <= 5 ? '🔥 Day One' : '⭐ Quero Muito',
      det.year ? new Date(Number(det.year), 0, 1) : '',
      '', // HLTB (atualizado em updateAllWishlistPrices)
      det.metacritic || '',
      det.initialPrice !== '' ? det.initialPrice : '',
      det.finalPrice !== '' ? det.finalPrice : '',
      `=IF(AND(ISNUMBER(H${r}),H${r}>0,ISNUMBER(I${r})),MAX(0,(H${r}-I${r})/H${r}),"")`,
      '', // Menor Histórico
      det.initialPrice ? Math.round(det.initialPrice * 0.5 * 100) / 100 : '', // Preço Alvo sugerido = 50% off
      'Steam',
      gpStatus,
      `=IF(B${r}="","",IF(LEFT(N${r},1)="✅","🎮 JÁ NO GAME PASS!",IF(AND(ISNUMBER(I${r}),ISNUMBER(L${r}),I${r}<=L${r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I${r}),ISNUMBER(K${r}),K${r}>0,I${r}<=K${r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J${r}),J${r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar")))))`,
      `=IF(AND(ISNUMBER(I${r}),ISNUMBER(F${r}),F${r}>0),I${r}/F${r},"")`,
      Number(appId),
      `=HYPERLINK("${det.storeUrl}","🛒 Steam")`,
      today,
      det.coverUrl || '',
    ]]);
    sh.setRowHeight(r, 52);
    nextRow++;
    added++;
    Utilities.sleep(250);
  }

  ui.alert(
    '✅ Wishlist Steam Importada!',
    `Itens na Steam: ${items.length}\nNovos adicionados: ${added}\n\nDica: Rode "🔄 Atualizar Preços da Wishlist" para preencher Menor Histórico (CheapShark/ITAD) e HLTB!`,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// FÓRMULAS PERSONALIZADAS DO GOOGLE SHEETS (STEAM & PROTONDB)
// ============================================================================

/**
 * Retorna o Steam AppID oficial a partir do título do jogo.
 * @param {string} titulo Nome do jogo
 * @return {number|string} Steam AppID
 * @customfunction
 */
function STEAM_APPID(titulo) {
  if (!titulo) return '';
  return steamFindAppId(titulo) || 'Não encontrado';
}

/**
 * Retorna o preço atual na Steam (no país da aba Config_APIs).
 * @param {number|string} appIdOuTitulo Steam AppID ou Nome do jogo
 * @return {number|string} Preço atual
 * @customfunction
 */
function STEAM_PRECO(appIdOuTitulo) {
  if (!appIdOuTitulo) return '';
  const d = steamGetAppDetails(appIdOuTitulo);
  return d && d.finalPrice !== '' ? d.finalPrice : 'N/A';
}

/**
 * Retorna o desconto atual na Steam (0 a 1 — formate como %).
 * @param {number|string} appIdOuTitulo Steam AppID ou Nome do jogo
 * @return {number|string} Percentual de desconto
 * @customfunction
 */
function STEAM_DESCONTO(appIdOuTitulo) {
  if (!appIdOuTitulo) return '';
  const d = steamGetAppDetails(appIdOuTitulo);
  return d ? d.discountPercent : '';
}

/**
 * Retorna a nota Metacritic (ou % de análises positivas Steam como fallback).
 * @param {number|string} appIdOuTitulo Steam AppID ou Nome do jogo
 * @return {number|string} Nota 0-100
 * @customfunction
 */
function STEAM_NOTA(appIdOuTitulo) {
  if (!appIdOuTitulo) return '';
  const d = steamGetAppDetails(appIdOuTitulo);
  if (!d) return '';
  if (d.metacritic) return d.metacritic;
  return steamGetReviewPercent(d.appId) || '';
}

/**
 * Retorna a URL da capa oficial do jogo na Steam (use dentro de =IMAGE(...)).
 * @param {number|string} appIdOuTitulo Steam AppID ou Nome do jogo
 * @return {string} URL da imagem
 * @customfunction
 */
function STEAM_CAPA(appIdOuTitulo) {
  if (!appIdOuTitulo) return '';
  const d = steamGetAppDetails(appIdOuTitulo);
  return d ? d.coverUrl : '';
}

/**
 * Retorna o nível de compatibilidade Steam Deck / Linux no ProtonDB.
 * @param {number|string} appIdOuTitulo Steam AppID ou Nome do jogo
 * @return {string} Badge ProtonDB (Platinum, Gold, Silver...)
 * @customfunction
 */
function PROTONDB_TIER(appIdOuTitulo) {
  if (!appIdOuTitulo) return '';
  return protonDbGetTier(appIdOuTitulo) || 'N/A';
}


/**
 * ============================================================================
 * 🎮 MICROSOFT PC GAME PASS CATALOG API (SEM CHAVE!)
 * ============================================================================
 * Usa os endpoints públicos oficiais da Microsoft:
 *  - catalog.gamepass.com/sigls/v2  (catálogo PC Game Pass, EA Play & Leaving Soon)
 *  - displaycatalog.mp.microsoft.com/v7.0/products  (títulos, capas e links BR)
 *
 * Funcionalidades:
 *  1) =GAMEPASS_CHECK("titulo") — verifica se o jogo está no PC Game Pass (ou saindo!)
 *  2) syncGamePassLeavingSoon() — lista os jogos saindo em breve na aba Gratis_Assinaturas
 *     e alerta automaticamente se algum deles estiver no seu Backlog!
 *  3) checkWishlistAgainstGamePass() — marca na aba Wishlist quais jogos você já pode
 *     jogar de graça no PC Game Pass antes de gastar na Steam/Epic!
 */

const GP_SIGLS = {
  PC_ALL: 'fdd9e2a7-0fee-49f6-ad69-4354098401ff',
  EA_PLAY: 'b8900d09-a491-44cc-916e-32b5acae621b',
  LEAVING_SOON: '393f05bf-e596-4ef6-9487-6d4fa0eab987',
};

/**
 * Busca a lista de Microsoft Store Product IDs (bigIds) para um siglId do Game Pass.
 */
function gamePassFetchSiglIds_(siglId) {
  const cfg = getConfig();
  const market = cfg.country || 'BR';
  const lang = market === 'BR' ? 'pt-br' : 'en-us';
  const cacheKey = 'gp_sigl_' + siglId + '_' + market;
  const cached = cacheGetJson(cacheKey);
  if (cached && Array.isArray(cached.ids)) return cached.ids;

  const url = `https://catalog.gamepass.com/sigls/v2?id=${siglId}&language=${lang}&market=${market}`;
  const res = safeFetchJson_(url, { headers: { 'User-Agent': 'GameBacklogMaster/2.0' } });
  if (!res.ok || !Array.isArray(res.data)) return [];

  const ids = res.data
    .filter(item => item && item.id)
    .map(item => String(item.id));

  cachePutJson(cacheKey, { ids: ids }, CACHE_TTL_SECONDS);
  return ids;
}

/**
 * Busca metadados (título, publisher, capa, link) na Microsoft Display Catalog API em lotes de 20.
 */
function msStoreFetchProducts_(bigIds) {
  if (!bigIds || bigIds.length === 0) return [];
  const cfg = getConfig();
  const market = cfg.country || 'BR';
  const lang = market === 'BR' ? 'pt-br' : 'en-us';

  const products = [];
  const chunkSize = 20;

  for (let i = 0; i < bigIds.length; i += chunkSize) {
    const chunk = bigIds.slice(i, i + chunkSize);
    const url = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${encodeURIComponent(chunk.join(','))}&market=${market}&languages=${lang}&MS-CV=DGU1mcuYo0WMMp+F.1`;
    const res = safeFetchJson_(url, { headers: { 'User-Agent': 'GameBacklogMaster/2.0' } });
    if (!res.ok || !res.data || !Array.isArray(res.data.Products)) continue;

    res.data.Products.forEach(p => {
      const lp = (p.LocalizedProperties && p.LocalizedProperties[0]) || {};
      const title = lp.ProductTitle || '';
      if (!title) return;
      let cover = '';
      if (Array.isArray(lp.Images)) {
        const poster = lp.Images.find(img => img.ImagePurpose === 'BrandedKeyArt' || img.ImagePurpose === 'Poster' || img.ImagePurpose === 'SuperHeroArt');
        if (poster && poster.Uri) {
          cover = poster.Uri.startsWith('//') ? 'https:' + poster.Uri : poster.Uri;
        }
      }
      products.push({
        id: p.ProductId,
        title: title,
        normTitle: normalizeTitle_(title),
        publisher: lp.PublisherName || '',
        coverUrl: cover,
        storeUrl: `https://www.xbox.com/pt-br/games/store/game/${p.ProductId}`,
      });
    });
  }
  return products;
}

/**
 * Retorna catálogo resumido (nomes normalizados) de PC Game Pass + EA Play + Leaving Soon (cache 6h).
 */
function gamePassGetCatalogIndex_() {
  const cached = cacheGetJson('gp_pc_index_v1');
  if (cached && cached.allTitles) return cached;

  const pcIds = gamePassFetchSiglIds_(GP_SIGLS.PC_ALL);
  const eaIds = gamePassFetchSiglIds_(GP_SIGLS.EA_PLAY);
  const leavingIds = gamePassFetchSiglIds_(GP_SIGLS.LEAVING_SOON);

  const uniqueAllIds = Array.from(new Set(pcIds.concat(eaIds)));
  const leavingSet = new Set(leavingIds);

  // Busca nomes em lote (limita a 320 títulos se catálogo for gigantesco para ficar ágil)
  const products = msStoreFetchProducts_(uniqueAllIds.slice(0, 360));
  const leavingProducts = leavingIds.length > 0 ? msStoreFetchProducts_(leavingIds) : [];

  const allTitles = products.map(p => p.normTitle);
  const leavingTitles = leavingProducts.map(p => p.normTitle);

  const index = {
    allTitles: allTitles,
    leavingTitles: leavingTitles,
    leavingCount: leavingProducts.length,
    totalCount: allTitles.length,
  };

  // Salva apenas a lista enxuta no cache para caber nos 100KB do CacheService
  cachePutJson('gp_pc_index_v1', index, CACHE_TTL_SECONDS);
  return index;
}

/**
 * Verifica se um título está incluso no PC Game Pass (ou saindo em breve!).
 * @param {string} title Nome do jogo
 * @return {string} "✅ No PC Game Pass" | "🚨 Saindo do Game Pass!" | "Não"
 */
function gamePassCheckTitle(title) {
  if (!title) return '';
  const norm = normalizeTitle_(title);
  if (!norm) return '';

  const index = gamePassGetCatalogIndex_();
  const isMatch = list => list.some(t => t === norm || (norm.length >= 5 && (t.startsWith(norm + ' ') || norm.startsWith(t + ' '))));

  if (isMatch(index.leavingTitles || [])) return '🚨 Saindo do Game Pass!';
  if (isMatch(index.allTitles || [])) return '✅ No PC Game Pass';
  return 'Não';
}

/**
 * Sincroniza os jogos "Saindo em Breve" do Game Pass na aba Gratis_Assinaturas
 * e cruza com o Backlog para avisar se algum jogo seu está prestes a sair!
 */
function syncGamePassLeavingSoon() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.GRATIS);
  if (!sh) return;

  ss.toast('Consultando catálogo "Saindo em Breve" do PC Game Pass...', '🚨 PC Game Pass', 5);
  const leavingIds = gamePassFetchSiglIds_(GP_SIGLS.LEAVING_SOON);
  const products = msStoreFetchProducts_(leavingIds);

  const startRow = 26; // Seção 3 em Gratis_Assinaturas
  sh.getRange(startRow, 1, 20, 8).clearContent();

  if (products.length === 0) {
    sh.getRange(startRow, 1, 1, 2).setValues([['Nenhum jogo anunciado para sair neste momento.', '✅ Tranquilo']]);
    ss.toast('Nenhum jogo saindo do Game Pass no momento.', '🎮 Game Pass', 4);
    return;
  }

  // Lê títulos do Backlog para alerta imediato
  const shBack = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const backRows = shBack.getRange(3, 3, Math.max(1, shBack.getLastRow() - 2), 2).getValues();
  const activeBacklogNorm = new Set();
  backRows.forEach(r => {
    const st = String(r[1] || '');
    if (r[0] && st !== '✅ Zerado' && st !== '🏆 100% / Platina' && st !== '💀 Dropado') {
      activeBacklogNorm.add(normalizeTitle_(r[0]));
    }
  });

  const rowsOut = [];
  const urgentMatches = [];

  products.slice(0, 20).forEach((p, idx) => {
    const r = startRow + idx;
    const inBacklog = activeBacklogNorm.has(p.normTitle);
    if (inBacklog) urgentMatches.push(p.title);

    rowsOut.push([
      p.title,
      '🚨 Saindo em Breve',
      p.publisher || 'Xbox / PC Game Pass',
      `=IF(COUNTIF(Backlog!$C$3:$C$500;"*"&A${r}&"*")>0;"⚠️ NO SEU BACKLOG!";"Catálogo Game Pass")`,
      '', // HLTB opcional
      false,
      `=HYPERLINK("${p.storeUrl}";"🎮 Ver no Xbox/PC")`,
      inBacklog ? 'PRIORIDADE MÁXIMA: jogo da sua fila saindo do catálogo!' : 'Verifique se vale correr para jogar antes da remoção.',
    ]);
  });

  // Nota: setValues em Apps Script usa sintaxe EN (vírgulas) em fórmulas!
  const enRows = rowsOut.map((row, idx) => {
    const r = startRow + idx;
    const copy = row.slice();
    copy[3] = `=IF(COUNTIF(Backlog!$C$3:$C$500,"*"&A${r}&"*")>0,"⚠️ NO SEU BACKLOG!","Catálogo Game Pass")`;
    copy[6] = `=HYPERLINK("${products[idx].storeUrl}","🎮 Ver no Xbox/PC")`;
    return copy;
  });

  sh.getRange(startRow, 1, enRows.length, 8).setValues(enRows);
  sh.getRange(startRow, 6, enRows.length, 1).insertCheckboxes();

  if (urgentMatches.length > 0) {
    ss.toast(`⚠️ ATENÇÃO: ${urgentMatches.length} jogo(s) do seu Backlog saindo do Game Pass: ${urgentMatches.join(', ')}`, '🚨 Game Pass Alerta', 9);
  } else {
    ss.toast(`${enRows.length} jogo(s) saindo do Game Pass listados na aba Gratis_Assinaturas!`, '🎮 Game Pass Atualizado', 5);
  }
}

/**
 * Checa TODOS os jogos da aba Wishlist contra o catálogo do PC Game Pass.
 */
function checkWishlistAgainstGamePass() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sh) return;

  ss.toast('Cruzando sua Wishlist com o catálogo do PC Game Pass...', '🎮 Checando Game Pass', 5);
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return;

  const titles = sh.getRange(3, 2, lastRow - 2, 1).getValues();
  let found = 0;

  for (let i = 0; i < titles.length; i++) {
    const t = String(titles[i][0] || '').trim();
    if (!t) continue;
    const status = gamePassCheckTitle(t);
    sh.getRange(i + 3, 14).setValue(status); // Col N = No Game Pass?
    if (status.includes('Game Pass')) found++;
  }

  ss.toast(`Verificação concluída! ${found} jogo(s) da sua Wishlist já estão no PC Game Pass!`, '🎮 Game Pass', 6);
}

/**
 * Fórmula personalizada: verifica ao vivo se um jogo está no PC Game Pass (ou saindo em breve).
 * @param {string} titulo Nome do jogo (ex: "Persona 5 Royal")
 * @return {string} "✅ No PC Game Pass", "🚨 Saindo do Game Pass!" ou "Não"
 * @customfunction
 */
function GAMEPASS_CHECK(titulo) {
  if (!titulo) return '';
  return gamePassCheckTitle(titulo);
}


/**
 * ============================================================================
 * 🏷️ APIS DE LOJAS & PREÇOS: CHEAPSHARK, ISTHEREANYDEAL v2, GOG & EPIC FREEBIES
 * ============================================================================
 * - CheapShark, GOG Catalog e Epic Freebies funcionam SEM CHAVE!
 * - IsThereAnyDeal (ITAD) v2 usa chave gratuita (Config_APIs!B30) para trazer
 *   preços nativos em BRL (incluindo Nuuvem, Steam, GOG, Epic, GMG, Humble!).
 */

const CS_BASE = 'https://www.cheapshark.com/api/1.0';
const CS_HEADERS = { 'User-Agent': 'GameBacklogMaster/2.0 (GoogleSheets)' };

/**
 * Mapa de lojas do CheapShark (com cache de 6h).
 */
function cheapSharkGetStores_() {
  const cached = cacheGetJson('cs_stores_map');
  if (cached) return cached;

  const res = safeFetchJson_(CS_BASE + '/stores', { headers: CS_HEADERS });
  const map = {};
  if (res.ok && Array.isArray(res.data)) {
    res.data.forEach(s => { map[String(s.storeID)] = s.storeName; });
    cachePutJson('cs_stores_map', map);
  }
  return map;
}

/**
 * Consulta preço atual mais barato + menor histórico no CheapShark (30+ lojas PC).
 * @param {string} title Nome do jogo
 * @param {number|string} optionalSteamAppId Opcional: acelera e garante match exato
 */
function cheapSharkLookup(title, optionalSteamAppId) {
  if (!title && !optionalSteamAppId) return null;
  const cacheKey = 'cs_game_' + (optionalSteamAppId || normalizeTitle_(title));
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  let searchUrl = CS_BASE + '/games?limit=10';
  if (optionalSteamAppId) {
    searchUrl += '&steamAppID=' + encodeURIComponent(optionalSteamAppId);
  } else {
    searchUrl += '&title=' + encodeURIComponent(String(title).trim());
  }

  let res = safeFetchJson_(searchUrl, { headers: CS_HEADERS });
  if ((!res.ok || !Array.isArray(res.data) || res.data.length === 0) && optionalSteamAppId && title) {
    res = safeFetchJson_(CS_BASE + '/games?limit=10&title=' + encodeURIComponent(String(title).trim()), { headers: CS_HEADERS });
  }
  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return null;

  let best = res.data[0];
  if (title) {
    let bestScore = -1;
    res.data.forEach(item => {
      const sim = titleSimilarity_(title, item.external);
      if (sim > bestScore) {
        bestScore = sim;
        best = item;
      }
    });
  }

  const detailRes = safeFetchJson_(CS_BASE + '/games?id=' + encodeURIComponent(best.gameID), { headers: CS_HEADERS });
  if (!detailRes.ok || !detailRes.data) return null;

  const d = detailRes.data;
  const stores = cheapSharkGetStores_();
  const topDeal = Array.isArray(d.deals) && d.deals.length > 0 ? d.deals[0] : null;
  const cheapestEverUsd = d.cheapestPriceEver && d.cheapestPriceEver.price ? Number(d.cheapestPriceEver.price) : null;
  const currentUsd = topDeal ? Number(topDeal.price) : (best.cheapest ? Number(best.cheapest) : null);
  const retailUsd = topDeal ? Number(topDeal.retailPrice) : null;

  const out = {
    gameId: best.gameID,
    title: (d.info && d.info.title) || best.external,
    steamAppId: (d.info && d.info.steamAppID) || best.steamAppID || '',
    currentPriceLocal: convertUsdToLocal_(currentUsd),
    retailPriceLocal: convertUsdToLocal_(retailUsd),
    historicalLowLocal: convertUsdToLocal_(cheapestEverUsd),
    currentPriceUsd: currentUsd,
    historicalLowUsd: cheapestEverUsd,
    bestStore: topDeal ? (stores[String(topDeal.storeID)] || 'PC Store') : '',
    dealUrl: topDeal && topDeal.dealID ? 'https://www.cheapshark.com/redirect?dealID=' + topDeal.dealID : '',
    savingsPct: topDeal && topDeal.savings ? Math.round(Number(topDeal.savings)) / 100 : 0,
  };

  cachePutJson(cacheKey, out);
  return out;
}

/**
 * Consulta IsThereAnyDeal (ITAD) API v2 — preços oficiais em BRL (Nuuvem, Steam, GOG, Epic, GMG...).
 */
function itadLookup(title, optionalSteamAppId) {
  const cfg = getConfig();
  if (!cfg.itadApiKey) return null;
  if (!title && !optionalSteamAppId) return null;

  const cacheKey = 'itad_v2_' + cfg.country + '_' + (optionalSteamAppId || normalizeTitle_(title));
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  // Passo 1: Resolver UUID via /games/lookup/v1
  let lookupUrl = 'https://api.isthereanydeal.com/games/lookup/v1?key=' + encodeURIComponent(cfg.itadApiKey);
  if (optionalSteamAppId) {
    lookupUrl += '&appid=' + encodeURIComponent(optionalSteamAppId);
  } else {
    lookupUrl += '&title=' + encodeURIComponent(String(title).trim());
  }

  let lRes = safeFetchJson_(lookupUrl);
  if ((!lRes.ok || !lRes.data || !lRes.data.found) && optionalSteamAppId && title) {
    lRes = safeFetchJson_(
      'https://api.isthereanydeal.com/games/lookup/v1?key=' + encodeURIComponent(cfg.itadApiKey) +
      '&title=' + encodeURIComponent(String(title).trim())
    );
  }
  if (!lRes.ok || !lRes.data || !lRes.data.found || !lRes.data.game || !lRes.data.game.id) {
    return null;
  }

  const gid = lRes.data.game.id;

  // Passo 2: /games/overview/v2 para melhor preço atual + menor histórico em BRL
  const ovUrl = 'https://api.isthereanydeal.com/games/overview/v2?key=' + encodeURIComponent(cfg.itadApiKey) +
    '&country=' + encodeURIComponent(cfg.country) + '&vouchers=true';
  const ovRes = safeFetchJson_(ovUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify([gid]),
  });

  if (!ovRes.ok || !ovRes.data || !Array.isArray(ovRes.data.prices) || ovRes.data.prices.length === 0) {
    return null;
  }

  const entry = ovRes.data.prices[0];
  const cur = entry.current || null;
  const low = entry.lowest || null;

  const out = {
    id: gid,
    title: lRes.data.game.title || title,
    currentPrice: cur && cur.price ? Number(cur.price.amount) : '',
    regularPrice: cur && cur.regular ? Number(cur.regular.amount) : '',
    discountPct: cur && cur.cut ? Number(cur.cut) / 100 : 0,
    bestStore: cur && cur.shop ? cur.shop.name : '',
    dealUrl: cur && cur.url ? cur.url : '',
    historicalLow: low && low.price ? Number(low.price.amount) : '',
    historicalLowStore: low && low.shop ? low.shop.name : '',
  };

  cachePutJson(cacheKey, out);
  return out;
}

/**
 * Consulta o catálogo público da GOG (DRM-Free) sem precisar de chave.
 */
function gogLookup(title) {
  if (!title) return null;
  const cacheKey = 'gog_v1_' + normalizeTitle_(title);
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  const url = 'https://embed.gog.com/games/ajax/filtered?mediaType=game&limit=10&search=' +
    encodeURIComponent(String(title).trim());
  const res = safeFetchJson_(url, { headers: { 'User-Agent': 'GameBacklogMaster/2.0' } });
  if (!res.ok || !res.data || !Array.isArray(res.data.products) || res.data.products.length === 0) {
    return null;
  }

  let best = res.data.products[0];
  let bestScore = -1;
  res.data.products.forEach(p => {
    const sim = titleSimilarity_(title, p.title);
    if (sim > bestScore) {
      bestScore = sim;
      best = p;
    }
  });

  const priceObj = best.price || {};
  const finalAmt = priceObj.finalAmount !== undefined ? Number(priceObj.finalAmount) : '';
  const baseAmt = priceObj.baseAmount !== undefined ? Number(priceObj.baseAmount) : '';
  const isUsd = String(priceObj.symbol || '$').includes('$') && !String(priceObj.symbol || '').includes('R$');

  const out = {
    id: best.id,
    title: best.title,
    currentPrice: isUsd && finalAmt !== '' ? convertUsdToLocal_(finalAmt) : finalAmt,
    regularPrice: isUsd && baseAmt !== '' ? convertUsdToLocal_(baseAmt) : baseAmt,
    discountPct: priceObj.discountPercentage ? Number(priceObj.discountPercentage) / 100 : 0,
    url: best.url ? 'https://www.gog.com' + best.url : 'https://www.gog.com',
  };

  cachePutJson(cacheKey, out);
  return out;
}

/**
 * Busca os jogos GRÁTIS atuais e futuros da Epic Games Store (API pública oficial!)
 * e preenche a tabela na aba Gratis_Assinaturas.
 */
function syncEpicFreeGames() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.GRATIS);
  if (!sh) return;

  ss.toast('Buscando jogos grátis na Epic Games Store...', '🎁 Epic Freebies', 4);
  const locale = cfg.country === 'BR' ? 'pt-BR' : 'en-US';
  const url = `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=${locale}&country=${cfg.country}&allowCountries=${cfg.country}`;
  const res = safeFetchJson_(url);

  if (!res.ok || !res.data || !res.data.data || !res.data.data.Catalog) {
    ss.toast('Não foi possível consultar a Epic Games agora.', '⚠️ Epic API', 5);
    return;
  }

  const elements = res.data.data.Catalog.searchStore.elements || [];
  const freeRows = [];

  elements.forEach(el => {
    const promos = el.promotions;
    if (!promos) return;

    const currentGroups = promos.promotionalOffers || [];
    const upcomingGroups = promos.upcomingPromotionalOffers || [];

    const extractOffer = (groups, statusLabel) => {
      groups.forEach(grp => {
        (grp.promotionalOffers || []).forEach(offer => {
          const disc = offer.discountSetting;
          if (disc && disc.discountPercentage === 0) {
            const slug = el.productSlug ||
              (el.catalogNs && el.catalogNs.mappings && el.catalogNs.mappings[0] && el.catalogNs.mappings[0].pageSlug) ||
              (el.offerMappings && el.offerMappings[0] && el.offerMappings[0].pageSlug) || '';
            const link = slug ? 'https://store.epicgames.com/pt-BR/p/' + slug.replace(/\/home$/, '') : 'https://store.epicgames.com/pt-BR/free-games';
            const origPrice = (el.price && el.price.totalPrice && el.price.totalPrice.fmtPrice && el.price.totalPrice.fmtPrice.originalPrice) || '';

            freeRows.push([
              el.title,
              statusLabel,
              offer.startDate ? new Date(offer.startDate) : '',
              offer.endDate ? new Date(offer.endDate) : '',
              origPrice,
              false,
              `=HYPERLINK("${link}","🎁 Resgatar na Epic")`,
              (el.description || '').slice(0, 180),
            ]);
          }
        });
      });
    };

    extractOffer(currentGroups, '🟢 GRÁTIS AGORA');
    extractOffer(upcomingGroups, '🟡 EM BREVE');
  });

  if (freeRows.length === 0) {
    ss.toast('Nenhuma promoção 100% gratuita encontrada no momento.', '🎁 Epic Freebies', 5);
    return;
  }

  // Preserva checkboxes de jogos já marcados como resgatados
  const existing = sh.getRange('A13:F30').getValues();
  const claimedSet = new Set();
  existing.forEach(r => { if (r[0] && r[5] === true) claimedSet.add(normalizeTitle_(r[0])); });
  freeRows.forEach(r => { if (claimedSet.has(normalizeTitle_(r[0]))) r[5] = true; });

  sh.getRange('A13:H30').clearContent();
  sh.getRange(13, 1, freeRows.length, 8).setValues(freeRows);
  sh.getRange(13, 3, freeRows.length, 2).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange(13, 6, freeRows.length, 1).insertCheckboxes();

  ss.toast(`${freeRows.length} jogo(s) grátis atualizados na aba Gratis_Assinaturas!`, '🎁 Epic Atualizada', 5);
}

// ============================================================================
// FÓRMULAS PERSONALIZADAS DE LOJAS (CHEAPSHARK, ITAD & GOG)
// ============================================================================

/**
 * Retorna o menor preço atual entre 30+ lojas PC via CheapShark (sem chave!).
 * @param {string} titulo Nome do jogo
 * @return {number|string} Preço convertido para a moeda da Config_APIs
 * @customfunction
 */
function CHEAPSHARK_ATUAL(titulo) {
  if (!titulo) return '';
  const g = cheapSharkLookup(titulo);
  return g && g.currentPriceLocal !== '' ? g.currentPriceLocal : 'N/A';
}

/**
 * Retorna o Menor Preço Histórico registrado via CheapShark (sem chave!).
 * @param {string} titulo Nome do jogo
 * @return {number|string} Menor histórico convertido para a moeda da Config_APIs
 * @customfunction
 */
function CHEAPSHARK_MENOR(titulo) {
  if (!titulo) return '';
  const g = cheapSharkLookup(titulo);
  return g && g.historicalLowLocal !== '' ? g.historicalLowLocal : 'N/A';
}

/**
 * Retorna o preço DRM-free atual na GOG (sem chave!).
 * @param {string} titulo Nome do jogo
 * @return {number|string} Preço na GOG
 * @customfunction
 */
function GOG_PRECO(titulo) {
  if (!titulo) return '';
  const g = gogLookup(titulo);
  return g && g.currentPrice !== '' ? g.currentPrice : 'N/A';
}

/**
 * Consulta preços em BRL no IsThereAnyDeal v2 (requer ITAD API Key em Config_APIs!B30).
 * @param {string} titulo Nome do jogo
 * @param {string} campo "atual" (padrão), "menor", "loja" ou "link"
 * @return {number|string} Informação solicitada
 * @customfunction
 */
function ITAD_PRECO(titulo, campo) {
  if (!titulo) return '';
  const mode = String(campo || 'atual').toLowerCase();
  const g = itadLookup(titulo);
  if (!g) return 'Sem chave/N/A';
  if (mode === 'menor' || mode === 'low') return g.historicalLow;
  if (mode === 'loja' || mode === 'shop') return g.bestStore;
  if (mode === 'link' || mode === 'url') return g.dealUrl;
  return g.currentPrice;
}


/**
 * ============================================================================
 * 🌐 APIS DE METADADOS MULTI-PLATAFORMA: RAWG.io & IGDB v4 (TWITCH OAUTH2)
 * ============================================================================
 * Ideais para jogos de PlayStation, Nintendo Switch, Xbox e Retro que não
 * estão na Steam! Ambas possuem plano gratuito.
 */

/**
 * Busca jogo na RAWG.io API (requer RAWG API Key em Config_APIs!B27).
 */
function rawgSearchGame(title) {
  const cfg = getConfig();
  if (!cfg.rawgApiKey || !title) return null;

  const cacheKey = 'rawg_v1_' + normalizeTitle_(title);
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  const url = 'https://api.rawg.io/api/games?key=' + encodeURIComponent(cfg.rawgApiKey) +
    '&search=' + encodeURIComponent(String(title).trim()) + '&page_size=5';
  const res = safeFetchJson_(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.results) || res.data.results.length === 0) {
    return null;
  }

  let best = res.data.results[0];
  let bestScore = -1;
  res.data.results.forEach(item => {
    const sim = titleSimilarity_(title, item.name);
    if (sim > bestScore) {
      bestScore = sim;
      best = item;
    }
  });

  const year = best.released ? Number(String(best.released).slice(0, 4)) : '';
  const genres = Array.isArray(best.genres) ? best.genres.map(g => g.name) : [];
  const platforms = Array.isArray(best.platforms) ? best.platforms.map(p => p.platform && p.platform.name).filter(Boolean) : [];

  const out = {
    id: best.id,
    name: best.name,
    metacritic: best.metacritic || (best.rating ? Math.round(best.rating * 20) : ''),
    year: year,
    genre: genres.length > 0 ? mapGenrePt_(genres[0]) : '',
    allGenres: genres.join(', '),
    platforms: platforms.join(', '),
    playtime: best.playtime || '',
    coverUrl: best.background_image || '',
  };

  cachePutJson(cacheKey, out);
  return out;
}

/**
 * Obtém e renova automaticamente o token OAuth2 da Twitch para a IGDB API v4.
 */
function igdbGetAccessToken_() {
  const cfg = getConfig();
  if (!cfg.igdbClientId || !cfg.igdbClientSecret) return null;

  const props = PropertiesService.getScriptProperties();
  const savedToken = props.getProperty('IGDB_ACCESS_TOKEN');
  const savedExp = Number(props.getProperty('IGDB_TOKEN_EXPIRY') || 0);
  if (savedToken && Date.now() < savedExp - 300000) {
    return savedToken;
  }

  const res = safeFetchJson_('https://id.twitch.tv/oauth2/token', {
    method: 'post',
    payload: {
      client_id: cfg.igdbClientId,
      client_secret: cfg.igdbClientSecret,
      grant_type: 'client_credentials',
    },
  });

  if (res.ok && res.data && res.data.access_token) {
    const expMs = Date.now() + (Number(res.data.expires_in || 3600) * 1000);
    props.setProperty('IGDB_ACCESS_TOKEN', res.data.access_token);
    props.setProperty('IGDB_TOKEN_EXPIRY', String(expMs));
    return res.data.access_token;
  }
  return null;
}

/**
 * Busca jogo na IGDB API v4 (requer Client ID + Secret da Twitch em Config_APIs!B28:B29).
 */
function igdbSearchGame(title) {
  const cfg = getConfig();
  const token = igdbGetAccessToken_();
  if (!token || !title) return null;

  const cacheKey = 'igdb_v4_' + normalizeTitle_(title);
  const cached = cacheGetJson(cacheKey);
  if (cached) return cached;

  const escaped = String(title).replace(/"/g, '\\"');
  const query = `search "${escaped}"; fields name,first_release_date,aggregated_rating,total_rating,genres.name,cover.image_id,platforms.name; limit 5;`;

  const res = safeFetchJson_('https://api.igdb.com/v4/games', {
    method: 'post',
    headers: {
      'Client-ID': cfg.igdbClientId,
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
    },
    payload: query,
  });

  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return null;

  let best = res.data[0];
  let bestScore = -1;
  res.data.forEach(item => {
    const sim = titleSimilarity_(title, item.name);
    if (sim > bestScore) {
      bestScore = sim;
      best = item;
    }
  });

  const year = best.first_release_date ? new Date(best.first_release_date * 1000).getFullYear() : '';
  const rating = best.aggregated_rating || best.total_rating || '';
  const genres = Array.isArray(best.genres) ? best.genres.map(g => g.name) : [];
  const platforms = Array.isArray(best.platforms) ? best.platforms.map(p => p.name) : [];
  const coverUrl = best.cover && best.cover.image_id
    ? 'https://images.igdb.com/igdb/image/upload/t_cover_big/' + best.cover.image_id + '.jpg'
    : '';

  const out = {
    id: best.id,
    name: best.name,
    rating: rating ? Math.round(rating) : '',
    year: year,
    genre: genres.length > 0 ? mapGenrePt_(genres[0]) : '',
    platforms: platforms.join(', '),
    coverUrl: coverUrl,
  };

  cachePutJson(cacheKey, out);
  return out;
}

// ============================================================================
// FÓRMULAS PERSONALIZADAS MULTI-PLATAFORMA (RAWG & IGDB)
// ============================================================================

/**
 * Consulta metadados na RAWG.io API (requer RAWG Key em Config_APIs!B27).
 * @param {string} titulo Nome do jogo
 * @param {string} campo "metacritic" (padrão), "ano", "genero", "capa" ou "playtime"
 * @return {number|string} Dado solicitado
 * @customfunction
 */
function RAWG_INFO(titulo, campo) {
  if (!titulo) return '';
  const g = rawgSearchGame(titulo);
  if (!g) return 'Sem chave/N/A';
  const mode = String(campo || 'metacritic').toLowerCase();
  if (mode === 'ano' || mode === 'year') return g.year;
  if (mode === 'genero' || mode === 'genre') return g.genre;
  if (mode === 'capa' || mode === 'cover') return g.coverUrl;
  if (mode === 'playtime') return g.playtime;
  return g.metacritic;
}

/**
 * Consulta metadados na IGDB API v4 (requer credenciais Twitch em Config_APIs!B28:B29).
 * @param {string} titulo Nome do jogo
 * @param {string} campo "nota" (padrão), "ano", "genero", "capa" ou "plataformas"
 * @return {number|string} Dado solicitado
 * @customfunction
 */
function IGDB_INFO(titulo, campo) {
  if (!titulo) return '';
  const g = igdbSearchGame(titulo);
  if (!g) return 'Sem chave/N/A';
  const mode = String(campo || 'nota').toLowerCase();
  if (mode === 'ano' || mode === 'year') return g.year;
  if (mode === 'genero' || mode === 'genre') return g.genre;
  if (mode === 'capa' || mode === 'cover') return g.coverUrl;
  if (mode === 'plataformas' || mode === 'platforms') return g.platforms;
  return g.rating;
}


/**
 * ============================================================================
 * 🚀 AUTOMAÇÕES INTELIGENTES: ENRIQUECIMENTO, WISHLIST, ROLETA, SESSÕES & TRIGGERS
 * ============================================================================
 */

// Helpers de fórmulas idênticas às da planilha para novas linhas criadas via script
function buildRemainingFormula_(r) {
  return `=IF(C${r}="","",IF(OR(D${r}="✅ Zerado",D${r}="🏆 100% / Platina",D${r}="💀 Dropado",D${r}="♾️ Contínuo / MP"),0,MAX(0,IF(Config_APIs!$B$14=2,N(J${r}),IF(Config_APIs!$B$14=3,IF(N(L${r})>0,N(L${r}),N(K${r})),IF(N(K${r})>0,N(K${r}),N(J${r}))))-N(M${r}))))`;
}

function buildProgressFormula_(r) {
  return `=IF(C${r}="","",IF(OR(D${r}="✅ Zerado",D${r}="🏆 100% / Platina"),1,IF(D${r}="💀 Dropado",0,IF(IF(N(K${r})>0,N(K${r}),N(J${r}))>0,MIN(0.99,N(M${r})/IF(N(K${r})>0,N(K${r}),N(J${r}))),0))))`;
}

function buildSparklineFormula_(r) {
  return `=IF(C${r}="","",SPARKLINE(O${r},{"charttype","bar";"max",1;"color1",IF(O${r}>=1,"#10B981",IF(O${r}>=0.5,"#3B82F6","#F59E0B"))}))`;
}

function buildCostPerHourFormula_(r) {
  return `=IF(C${r}="","",IF(N(T${r})=0,"Grátis",IF(N(M${r})>0,T${r}/M${r},IF(N(K${r})>0,T${r}/K${r},IF(N(J${r})>0,T${r}/J${r},"")))))`;
}

function buildScoreFormula_(r) {
  return `=IF(OR(C${r}="",AND(D${r}<>"📌 Backlog",D${r}<>"⏸️ Pausado")),"",ROUND(Config_APIs!$B$18*IF(E${r}="🔥 1 - Urgente",100,IF(E${r}="⭐ 2 - Alta",80,IF(E${r}="👍 3 - Média",55,IF(E${r}="🧊 4 - Baixa",30,IF(E${r}="💤 5 - Talvez",15,50)))))+Config_APIs!$B$19*IF(ISNUMBER(R${r}),R${r},75)+Config_APIs!$B$20*MAX(15,MIN(100,100-IF(N(K${r})>0,K${r},IF(N(J${r})>0,J${r},20))*0.9))+Config_APIs!$B$21*IF(ISNUMBER(W${r}),MIN(100,MAX(10,(TODAY()-W${r})/3.65)),50),1))`;
}

function ensureSheetRows_(sh, needed) {
  const maxR = sh.getMaxRows();
  if (needed > maxR) sh.insertRowsAfter(maxR, needed - maxR + 20);
}

/**
 * Coleta dados combinados de TODAS as APIs disponíveis para um título.
 */
function fetchUnifiedGameData(title, optionalAppId) {
  const hltb = hltbSearchGame(title);
  const steam = steamGetAppDetails(optionalAppId || title);
  const appId = (steam && steam.appId) || optionalAppId || '';
  const proton = appId ? protonDbGetTier(appId) : '';
  const rawg = (!steam || !steam.metacritic || !steam.coverUrl) ? rawgSearchGame(title) : null;
  const igdb = (!steam && !rawg) ? igdbSearchGame(title) : null;

  let critic = (steam && steam.metacritic) || (rawg && rawg.metacritic) || (igdb && igdb.rating) || '';
  if (!critic && appId) critic = steamGetReviewPercent(appId);
  if (!critic && hltb && hltb.reviewScore) critic = hltb.reviewScore;

  const year = (steam && steam.year) || (hltb && hltb.year) || (rawg && rawg.year) || (igdb && igdb.year) || '';
  const genre = (steam && steam.genre) || (rawg && rawg.genre) || (igdb && igdb.genre) || '';
  const coverUrl = (steam && steam.coverUrl) || (rawg && rawg.coverUrl) || (igdb && igdb.coverUrl) || (hltb && hltb.coverUrl) || '';

  return {
    title: (steam && steam.name) || (hltb && hltb.name) || (rawg && rawg.name) || title,
    appId: appId,
    year: year,
    genre: genre,
    critic: critic,
    coverUrl: coverUrl,
    protonTier: proton,
    hltbMain: hltb ? hltb.main : '',
    hltbExtra: hltb ? hltb.extra : '',
    hltbComp: hltb ? hltb.completionist : '',
    hltbUrl: hltb ? hltb.url : '',
    steamPrice: steam ? steam.finalPrice : '',
    steamRegularPrice: steam ? steam.initialPrice : '',
    steamStoreUrl: steam ? steam.storeUrl : '',
  };
}

/**
 * Enriquecimento de 1 linha selecionada na aba Backlog.
 */
function enrichSelectedBacklogRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();
  if (sh.getName() !== SHEET_NAMES.BACKLOG) {
    SpreadsheetApp.getUi().alert('Selecione uma linha de jogo na aba "Backlog" primeiro.');
    return;
  }
  const row = sh.getActiveRange().getRow();
  if (row < 3) {
    SpreadsheetApp.getUi().alert('Selecione uma linha a partir da linha 3.');
    return;
  }
  const title = String(sh.getRange(row, 3).getValue() || '').trim();
  if (!title) {
    SpreadsheetApp.getUi().alert('Digite primeiro o Título do jogo na coluna C desta linha.');
    return;
  }

  ss.toast(`Buscando HLTB, Steam, ProtonDB e metadados para "${title}"...`, '⚡ Enriquecendo', 6);
  const changed = enrichBacklogRow_(sh, row, true);
  ss.toast(changed ? `"${title}" atualizado com sucesso!` : `Nenhum novo dado encontrado para "${title}".`, '✅ Concluído', 5);
}

/**
 * Enriquecimento em lote de todas as linhas sem HLTB ou sem Capa na aba Backlog.
 */
function enrichBacklogBatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 3) return;
  const rows = sh.getRange(3, 1, lastRow - 2, 31).getValues();

  let enriched = 0;
  let remaining = 0;
  const startTime = Date.now();

  ss.toast('Iniciando enriquecimento em lote...', '🚀 Backlog Master', 5);

  for (let i = 0; i < rows.length; i++) {
    const title = String(rows[i][2] || '').trim();
    if (!title) continue;
    const needsData = !rows[i][9] || !rows[i][17] || !rows[i][28] || !rows[i][7];
    if (!needsData) continue;

    if (Date.now() - startTime > 250000) {
      remaining++;
      continue;
    }

    if (enrichBacklogRow_(sh, i + 3, false)) enriched++;
    Utilities.sleep(250);
  }

  const msg = remaining > 0
    ? `${enriched} jogos enriquecidos nesta rodada! Restam ${remaining} — basta rodar novamente para continuar de onde parou.`
    : `${enriched} jogo(s) enriquecido(s) com HLTB, capas, notas e ProtonDB!`;
  SpreadsheetApp.getUi().alert('🚀 Enriquecimento Concluído', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Atualiza uma linha da aba Backlog preenchendo apenas campos vazios (ou forçando se force=true).
 */
function enrichBacklogRow_(sh, row, force) {
  const vals = sh.getRange(row, 1, 1, 31).getValues()[0];
  const title = String(vals[2] || '').trim();
  if (!title) return false;

  const existingAppId = vals[27] ? String(vals[27]).trim() : '';
  const data = fetchUnifiedGameData(title, existingAppId);
  let modified = false;

  const setIf = (colIdx1, newVal) => {
    if (newVal === '' || newVal === null || newVal === undefined) return;
    if (force || vals[colIdx1 - 1] === '' || vals[colIdx1 - 1] === null) {
      sh.getRange(row, colIdx1).setValue(newVal);
      modified = true;
    }
  };

  setIf(8, data.genre);       // H: Gênero
  setIf(9, data.year);        // I: Ano
  setIf(10, data.hltbMain);   // J: HLTB Main
  setIf(11, data.hltbExtra);  // K: HLTB Extra
  setIf(12, data.hltbComp);   // L: HLTB 100%
  setIf(18, data.critic);     // R: Nota Crítica
  setIf(22, data.protonTier); // V: Deck / ProtonDB
  setIf(28, data.appId);      // AB: Steam AppID
  setIf(29, data.coverUrl);   // AC: URL Capa

  if (data.hltbUrl) {
    sh.getRange(row, 30).setFormula(`=HYPERLINK("${data.hltbUrl}","⏱️ HLTB")`);
    modified = true;
  }
  if (data.coverUrl) {
    sh.setRowHeight(row, 52);
  }
  return modified;
}

/**
 * Atualiza preços atuais, descontos, menor histórico e melhor loja de toda a Wishlist!
 * Combina IsThereAnyDeal v2 (se chave ativa) + Steam Store BR + CheapShark + GOG.
 */
function updateAllWishlistPrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 3) return;
  const rows = sh.getRange(3, 1, lastRow - 2, 20).getValues();

  let updated = 0;
  let buyAlerts = [];
  const today = new Date();
  const startTime = Date.now();

  ss.toast('Consultando Steam, CheapShark, ITAD, GOG e PC Game Pass...', '🏷️ Atualizando Wishlist', 5);

  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - startTime > 250000) break;
    const title = String(rows[i][1] || '').trim();
    if (!title) continue;

    const r = i + 3;
    const appId = rows[i][16] || steamFindAppId(title) || '';
    const steam = appId ? steamGetAppDetails(appId) : null;
    const itad = itadLookup(title, appId);
    const cs = !itad ? cheapSharkLookup(title, appId) : null;
    const gog = gogLookup(title);
    const gpStatus = gamePassCheckTitle(title);

    // Determina o melhor preço atual entre todas as fontes
    const candidates = [];
    if (itad && itad.currentPrice !== '') {
      candidates.push({ price: itad.currentPrice, shop: itad.bestStore || 'ITAD', url: itad.dealUrl });
    }
    if (steam && steam.finalPrice !== '') {
      candidates.push({ price: steam.finalPrice, shop: 'Steam', url: steam.storeUrl });
    }
    if (cs && cs.currentPriceLocal !== '') {
      candidates.push({ price: cs.currentPriceLocal, shop: cs.bestStore || 'PC Store', url: cs.dealUrl });
    }
    if (gog && gog.currentPrice !== '') {
      candidates.push({ price: gog.currentPrice, shop: 'GOG', url: gog.url });
    }

    candidates.sort((a, b) => a.price - b.price);
    const bestOffer = candidates[0] || null;

    const fullPrice = (steam && steam.initialPrice !== '') ? steam.initialPrice
      : (itad && itad.regularPrice !== '' ? itad.regularPrice
      : (cs && cs.retailPriceLocal !== '' ? cs.retailPriceLocal : rows[i][7]));

    const histLowCandidates = [];
    if (itad && itad.historicalLow !== '') histLowCandidates.push(itad.historicalLow);
    if (cs && cs.historicalLowLocal !== '') histLowCandidates.push(cs.historicalLowLocal);
    if (bestOffer) histLowCandidates.push(bestOffer.price);
    const histLow = histLowCandidates.length > 0 ? Math.min.apply(null, histLowCandidates) : rows[i][10];

    if (!rows[i][5]) {
      const hltb = hltbSearchGame(title);
      if (hltb && (hltb.extra || hltb.main)) sh.getRange(r, 6).setValue(hltb.extra || hltb.main);
    }
    if (!rows[i][6] && steam && steam.metacritic) sh.getRange(r, 7).setValue(steam.metacritic);
    if (fullPrice !== '' && fullPrice !== undefined) sh.getRange(r, 8).setValue(fullPrice);
    if (bestOffer) {
      sh.getRange(r, 9).setValue(bestOffer.price);
      sh.getRange(r, 13).setValue(bestOffer.shop);
      if (bestOffer.url) sh.getRange(r, 18).setFormula(`=HYPERLINK("${bestOffer.url}","🛒 ${bestOffer.shop}")`);
    }
    if (histLow !== '' && histLow !== undefined) sh.getRange(r, 11).setValue(histLow);
    sh.getRange(r, 14).setValue(gpStatus); // Col N: No Game Pass?
    if (appId && !rows[i][16]) sh.getRange(r, 17).setValue(appId);
    if (steam && steam.coverUrl && !rows[i][19]) {
      sh.getRange(r, 20).setValue(steam.coverUrl);
      sh.setRowHeight(r, 52);
    }
    sh.getRange(r, 19).setValue(today);

    const targetPrice = Number(rows[i][11]);
    if (bestOffer && targetPrice > 0 && bestOffer.price <= targetPrice && !gpStatus.includes('No PC Game Pass')) {
      buyAlerts.push({ title: title, price: bestOffer.price, target: targetPrice, shop: bestOffer.shop, url: bestOffer.url });
    }
    updated++;
    Utilities.sleep(200);
  }

  ss.toast(`${updated} jogo(s) da Wishlist atualizados! ${buyAlerts.length} oferta(s) no Preço Alvo!`, '✅ Wishlist Atualizada', 6);
  return buyAlerts;
}

/**
 * Envia e-mail HTML elegante com os jogos da Wishlist em oferta (usado manualmente ou no trigger diário).
 */
function sendWishlistDealsEmail() {
  const cfg = getConfig();
  const recipient = cfg.alertEmail || Session.getActiveUser().getEmail();
  if (!recipient) {
    SpreadsheetApp.getUi().alert('Configure seu e-mail em Config_APIs!B12 para receber alertas.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  const rows = sh.getRange(3, 1, Math.max(1, sh.getLastRow() - 2), 18).getValues();
  const deals = rows.filter(r => r[1] && (String(r[14]).includes('COMPRAR') || String(r[14]).includes('MENOR HISTÓRICO') || String(r[14]).includes('GAME PASS')));

  if (deals.length === 0) {
    ss.toast('Nenhum jogo da Wishlist atingiu o Preço Alvo ou Menor Histórico hoje.', '📧 Sem Alertas', 5);
    return;
  }

  let html = '<div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">';
  html += '<div style="background:#0f172a;color:#fff;padding:18px 22px"><h2 style="margin:0">🎮 Alerta de Promoções — Game Backlog Master</h2></div>';
  html += '<div style="padding:18px 22px"><p>Os seguintes jogos da sua Wishlist estão em ótimo ponto de compra hoje:</p><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Jogo</th><th style="padding:8px">Atual</th><th style="padding:8px">Alvo</th><th style="padding:8px">Loja</th><th style="padding:8px">Status</th></tr>';

  deals.forEach(d => {
    const pAtual = typeof d[8] === 'number' ? 'R$ ' + d[8].toFixed(2).replace('.', ',') : d[8];
    const pAlvo = typeof d[11] === 'number' ? 'R$ ' + d[11].toFixed(2).replace('.', ',') : d[11];
    html += `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px"><b>${d[1]}</b></td><td style="padding:8px;text-align:center;color:#059669;font-weight:bold">${pAtual}</td><td style="padding:8px;text-align:center">${pAlvo}</td><td style="padding:8px;text-align:center">${d[12] || '-'}</td><td style="padding:8px;text-align:center">${d[14]}</td></tr>`;
  });

  html += `</table><p style="margin-top:16px"><a href="${ss.getUrl()}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir Minha Planilha</a></p></div></div>`;

  MailApp.sendEmail({
    to: recipient,
    subject: `🔥 ${deals.length} jogo(s) da sua Wishlist em oferta hoje!`,
    htmlBody: html,
  });
  ss.toast(`Alerta enviado para ${recipient}!`, '📧 E-mail Enviado', 5);
}

/**
 * 🎲 Roleta do Backlog — filtra jogos da fila e escolhe o próximo jogo com peso pelo Score!
 */
function pickBacklogRoulette(filters) {
  const f = filters || {};
  const maxHours = Number(f.maxHours) || 999;
  const platform = String(f.platform || 'ALL');
  const onlyHighPrio = Boolean(f.onlyHighPrio);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return { ok: false, message: 'Seu Backlog está vazio!' };

  const rows = sh.getRange(3, 1, lastRow - 2, 30).getValues();
  const candidates = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const title = String(r[2] || '').trim();
    const status = String(r[3] || '');
    if (!title) continue;
    if (status !== '📌 Backlog' && status !== '⏸️ Pausado') continue;
    if (platform !== 'ALL' && String(r[5]) !== platform && String(r[6]) !== platform) continue;

    const prio = String(r[4] || '');
    if (onlyHighPrio && !prio.includes('1 -') && !prio.includes('2 -')) continue;

    const hltb = Number(r[10]) || Number(r[9]) || 0;
    if (hltb > 0 && hltb > maxHours) continue;

    candidates.push({
      row: i + 3,
      title: title,
      status: status,
      priority: prio,
      platform: String(r[5] || ''),
      genre: String(r[7] || ''),
      hltb: hltb,
      critic: r[17] || '-',
      score: Number(r[26]) || 50,
      coverUrl: String(r[28] || ''),
    });
  }

  if (candidates.length === 0) {
    return { ok: false, message: 'Nenhum jogo encontrado com esses filtros. Tente aumentar as horas máximas!' };
  }

  // Seleção ponderada pelo Score Próximo (jogos melhores têm mais chance, mas ainda há surpresa!)
  const totalWeight = candidates.reduce((acc, c) => acc + Math.max(10, c.score), 0);
  let rand = Math.random() * totalWeight;
  let picked = candidates[0];
  for (let i = 0; i < candidates.length; i++) {
    rand -= Math.max(10, candidates[i].score);
    if (rand <= 0) {
      picked = candidates[i];
      break;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    ok: true,
    picked: picked,
    totalCandidates: candidates.length,
    top3: candidates.slice(0, 3),
  };
}

function quickBacklogRoulette() {
  const ui = SpreadsheetApp.getUi();
  const res = pickBacklogRoulette({});
  if (!res.ok) {
    ui.alert('🎲 Roleta do Backlog', res.message, ui.ButtonSet.OK);
    return;
  }
  const p = res.picked;
  const resp = ui.alert(
    '🎲 O Próximo Jogo Sorteado Foi:',
    `🎮 ${p.title}\n📱 Plataforma: ${p.platform}  |  🏷️ Gênero: ${p.genre || '-'}\n⏱️ HLTB Estimado: ${p.hltb || '?'}h  |  ⭐ Crítica: ${p.critic}\n🧠 Score Backlog Master: ${p.score}\n\nDeseja marcar "${p.title}" como 🕹️ Jogando agora?`,
    ui.ButtonSet.YES_NO
  );
  if (resp === ui.Button.YES) {
    startPlayingGame(p.row);
  }
}

/**
 * Marca um jogo como "🕹️ Jogando" e preenche Data Início = hoje.
 */
function startPlayingGame(rowNumber) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  sh.getRange(rowNumber, 4).setValue('🕹️ Jogando');
  if (!sh.getRange(rowNumber, 24).getValue()) {
    sh.getRange(rowNumber, 24).setValue(new Date());
  }
  const title = sh.getRange(rowNumber, 3).getValue();
  ss.toast(`"${title}" marcado como 🕹️ Jogando! Boa jogatina!`, '🎮 Let\'s Play!', 5);
  return { ok: true, title: title };
}

/**
 * Registra uma sessão na aba Sessoes e soma automaticamente as horas no Backlog!
 */
function logGameSession(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shSess = ss.getSheetByName(SHEET_NAMES.SESSOES);
  const shBack = ss.getSheetByName(SHEET_NAMES.BACKLOG);

  const title = String(payload.title || '').trim();
  const hours = Number(payload.hours) || 0;
  const fun = Number(payload.fun) || 5;
  const beatStatus = String(payload.beatStatus || 'Não');
  const notes = String(payload.notes || '');
  const dateObj = payload.date ? new Date(payload.date + 'T12:00:00') : new Date();

  if (!title || hours <= 0) return { ok: false, message: 'Informe o jogo e as horas jogadas.' };

  // Encontra primeira linha vazia em Sessoes (a partir da linha 3)
  const sessTitles = shSess.getRange('B3:B500').getValues();
  let targetRow = 3;
  for (let i = 0; i < sessTitles.length; i++) {
    if (!sessTitles[i][0]) { targetRow = i + 3; break; }
    targetRow = i + 4;
  }

  ensureSheetRows_(shSess, targetRow + 5);
  shSess.getRange(targetRow, 1, 1, 10).setValues([[
    dateObj,
    title,
    `=IF(B${targetRow}="","",IFERROR(INDEX(Backlog!$F$3:$F$500,MATCH(B${targetRow},Backlog!$C$3:$C$500,0)),""))`,
    hours,
    fun,
    beatStatus,
    `=IF(ISNUMBER(A${targetRow}),MONTH(A${targetRow}),"")`,
    `=IF(ISNUMBER(A${targetRow}),YEAR(A${targetRow}),"")`,
    `=IF(ISNUMBER(A${targetRow}),TEXT(A${targetRow},"mm/yyyy"),"")`,
    notes,
  ]]);

  // Atualiza horas jogadas e status na aba Backlog
  const backRows = shBack.getRange(3, 1, Math.max(1, shBack.getLastRow() - 2), 26).getValues();
  for (let i = 0; i < backRows.length; i++) {
    if (normalizeTitle_(backRows[i][2]) === normalizeTitle_(title)) {
      const r = i + 3;
      const curHours = Number(backRows[i][12]) || 0;
      shBack.getRange(r, 13).setValue(Math.round((curHours + hours) * 10) / 10);
      if (!backRows[i][23]) shBack.getRange(r, 24).setValue(dateObj);
      if (beatStatus === '✅ Zerado' || beatStatus === '🏆 100% / Platina') {
        shBack.getRange(r, 4).setValue(beatStatus);
        shBack.getRange(r, 25).setValue(dateObj);
      } else if (backRows[i][3] === '📌 Backlog' || backRows[i][3] === '⏸️ Pausado') {
        shBack.getRange(r, 4).setValue('🕹️ Jogando');
      }
      break;
    }
  }

  ss.toast(`Sessão de ${hours}h registrada para "${title}"!`, '⏱️ Sessão Salva', 5);
  return { ok: true };
}

function promptLogSession() {
  openBacklogSidebar();
}

/**
 * Funções expostas para a Sidebar.html (Busca ao vivo + Adicionar ao Backlog/Wishlist).
 */
function sidebarSearchGame(query) {
  const unified = fetchUnifiedGameData(query, '');
  const itad = itadLookup(query, unified.appId);
  const cs = !itad ? cheapSharkLookup(query, unified.appId) : null;
  const gpStatus = gamePassCheckTitle(unified.title || query);

  return {
    title: unified.title,
    appId: unified.appId,
    year: unified.year,
    genre: unified.genre,
    critic: unified.critic,
    coverUrl: unified.coverUrl,
    protonTier: unified.protonTier,
    gamePass: gpStatus,
    hltbMain: unified.hltbMain,
    hltbExtra: unified.hltbExtra,
    hltbComp: unified.hltbComp,
    hltbUrl: unified.hltbUrl,
    currentPrice: (itad && itad.currentPrice !== '') ? itad.currentPrice
      : (unified.steamPrice !== '' ? unified.steamPrice : (cs ? cs.currentPriceLocal : '')),
    regularPrice: unified.steamRegularPrice !== '' ? unified.steamRegularPrice : (cs ? cs.retailPriceLocal : ''),
    historicalLow: (itad && itad.historicalLow !== '') ? itad.historicalLow : (cs ? cs.historicalLowLocal : ''),
    bestStore: (itad && itad.bestStore) || (unified.steamPrice !== '' ? 'Steam' : (cs ? cs.bestStore : '')),
    dealUrl: (itad && itad.dealUrl) || unified.steamStoreUrl || (cs ? cs.dealUrl : ''),
  };
}

function sidebarAddToBacklog(game) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const titles = sh.getRange('C3:C500').getValues();
  let r = 3;
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i][0]) { r = i + 3; break; }
    r = i + 4;
  }
  ensureSheetRows_(sh, r + 5);
  const linkFormula = game.hltbUrl
    ? `=HYPERLINK("${game.hltbUrl}","⏱️ HLTB")`
    : `=IF(C${r}="","",HYPERLINK("https://howlongtobeat.com/?q="&ENCODEURL(C${r}),"⏱️ HLTB"))`;

  sh.getRange(r, 1, 1, 31).setValues([[
    `=IF(C${r}="","","G-"&TEXT(ROW()-2,"000"))`,
    `=IF(AC${r}="","",IMAGE(AC${r},1))`,
    game.title,
    game.status || '📌 Backlog',
    game.priority || '⭐ 2 - Alta',
    game.platform || 'PC',
    game.store || 'Steam',
    game.genre || '',
    game.year || '',
    game.hltbMain || '',
    game.hltbExtra || '',
    game.hltbComp || '',
    0,
    buildRemainingFormula_(r),
    buildProgressFormula_(r),
    buildSparklineFormula_(r),
    '',
    game.critic || '',
    '',
    game.pricePaid !== '' && game.pricePaid !== undefined ? Number(game.pricePaid) : '',
    buildCostPerHourFormula_(r),
    game.protonTier || '',
    new Date(),
    '', '',
    `=IF(AND(ISNUMBER(X${r}),ISNUMBER(Y${r})),MAX(1,Y${r}-X${r}),"")`,
    buildScoreFormula_(r),
    game.appId || '',
    game.coverUrl || '',
    linkFormula,
    game.notes || ''
  ]]);
  sh.setRowHeight(r, 52);
  return { ok: true, row: r };
}

function sidebarAddToWishlist(game) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.WISHLIST);
  const titles = sh.getRange('B3:B300').getValues();
  let r = 3;
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i][0]) { r = i + 3; break; }
    r = i + 4;
  }
  ensureSheetRows_(sh, r + 5);
  const linkFormula = game.dealUrl
    ? `=HYPERLINK("${game.dealUrl}","🛒 ${game.bestStore || 'Loja'}")`
    : `=HYPERLINK("https://isthereanydeal.com/search/?q="&ENCODEURL(B${r}),"🔎 ITAD")`;

  sh.getRange(r, 1, 1, 20).setValues([[
    `=IF(T${r}="","",IMAGE(T${r},1))`,
    game.title,
    game.platform || 'PC',
    game.hype || '⭐ Quero Muito',
    game.year ? new Date(Number(game.year), 0, 1) : '',
    game.hltbExtra || game.hltbMain || '',
    game.critic || '',
    game.regularPrice !== '' ? Number(game.regularPrice) : '',
    game.currentPrice !== '' ? Number(game.currentPrice) : '',
    `=IF(AND(ISNUMBER(H${r}),H${r}>0,ISNUMBER(I${r})),MAX(0,(H${r}-I${r})/H${r}),"")`,
    game.historicalLow !== '' ? Number(game.historicalLow) : '',
    game.targetPrice !== '' ? Number(game.targetPrice) : '',
    game.bestStore || '',
    game.gamePass || 'Não',
    `=IF(B${r}="","",IF(LEFT(N${r},1)="✅","🎮 JÁ NO GAME PASS!",IF(AND(ISNUMBER(I${r}),ISNUMBER(L${r}),I${r}<=L${r}),"🎯 COMPRAR AGORA!",IF(AND(ISNUMBER(I${r}),ISNUMBER(K${r}),K${r}>0,I${r}<=K${r}*1.05),"🔥 MENOR HISTÓRICO",IF(AND(ISNUMBER(J${r}),J${r}>=0.5),"💸 Ótima Promo (-50%+)","⏳ Aguardar")))))`,
    `=IF(AND(ISNUMBER(I${r}),ISNUMBER(F${r}),F${r}>0),I${r}/F${r},"")`,
    game.appId || '',
    linkFormula,
    new Date(),
    game.coverUrl || '',
  ]]);
  sh.setRowHeight(r, 52);
  return { ok: true, row: r };
}

function sidebarGetBacklogTitles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.BACKLOG);
  const vals = sh.getRange('C3:D500').getValues();
  return vals
    .filter(r => r[0])
    .map(r => ({ title: String(r[0]), status: String(r[1]) }));
}

/**
 * Triggers automáticos diários (08:00): atualiza Wishlist, envia alerta de promoções e sincroniza Epic Grátis!
 */
function dailyAutomationJob() {
  try { syncEpicFreeGames(); } catch (e) { Logger.log('Epic daily err: ' + e); }
  try { syncGamePassLeavingSoon(); } catch (e) { Logger.log('Game Pass daily err: ' + e); }
  try {
    const alerts = updateAllWishlistPrices();
    if (alerts && alerts.length > 0 && getConfig().alertEmail) {
      sendWishlistDealsEmail();
    }
  } catch (e) { Logger.log('Wishlist daily err: ' + e); }
}

function installDailyTriggers() {
  removeAllTriggers(true);
  ScriptApp.newTrigger('dailyAutomationJob')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert(
    '⏰ Automação Diária Ativada!',
    'Todos os dias às 08h o Backlog Master vai:\n1. Atualizar jogos grátis da Epic Games Store\n2. Checar preços e menores históricos da Wishlist\n3. Enviar e-mail de alerta se algum jogo bater seu Preço Alvo (se o e-mail estiver preenchido em Config_APIs!B12).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function removeAllTriggers(silent) {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyAutomationJob') ScriptApp.deleteTrigger(t);
  });
  if (!silent) {
    SpreadsheetApp.getUi().alert('🛑 Automação desativada com sucesso.');
  }
}

/**
 * Testa todas as APIs configuradas e exibe um relatório de diagnóstico.
 */
function testAllApiConnections() {
  const cfg = getConfig();
  const lines = [];

  const hltb = hltbSearchGame('Hollow Knight');
  lines.push(`• HowLongToBeat: ${hltb ? '✅ OK (' + hltb.name + ' — Main ' + hltb.main + 'h)' : '⚠️ Bloqueado/Endpoint alterado (ajuste Config_APIs!B31)'}`);

  const steam = steamGetAppDetails(367520);
  lines.push(`• Steam Store API: ${steam ? '✅ OK (Hollow Knight — R$ ' + steam.finalPrice + ')' : '❌ Falhou'}`);

  const cs = cheapSharkLookup('Hollow Knight', 367520);
  lines.push(`• CheapShark API: ${cs ? '✅ OK (Menor hist. ~R$ ' + cs.historicalLowLocal + ')' : '❌ Falhou'}`);

  const proton = protonDbGetTier(367520);
  lines.push(`• ProtonDB API: ${proton ? '✅ OK (' + proton + ')' : '❌ Falhou'}`);

  const gog = gogLookup('Hollow Knight');
  lines.push(`• GOG Catalog API: ${gog ? '✅ OK (' + gog.title + ')' : '❌ Falhou'}`);

  const epic = safeFetchJson_('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR');
  lines.push(`• Epic Freebies API: ${epic.ok ? '✅ OK' : '❌ Falhou'}`);

  const gpIds = gamePassFetchSiglIds_(GP_SIGLS.PC_ALL);
  lines.push(`• PC Game Pass API: ${gpIds.length > 0 ? '✅ OK (' + gpIds.length + ' títulos PC no catálogo)' : '❌ Falhou'}`);

  if (cfg.rawgApiKey) {
    const rawg = rawgSearchGame('Hollow Knight');
    lines.push(`• RAWG.io API: ${rawg ? '✅ OK (Metacritic ' + rawg.metacritic + ')' : '❌ Chave inválida'}`);
  } else {
    lines.push('• RAWG.io API: ⚪ Sem chave (opcional)');
  }

  if (cfg.igdbClientId && cfg.igdbClientSecret) {
    const igdb = igdbSearchGame('Hollow Knight');
    lines.push(`• IGDB v4 (Twitch): ${igdb ? '✅ OK (' + igdb.name + ')' : '❌ Credenciais inválidas'}`);
  } else {
    lines.push('• IGDB v4 (Twitch): ⚪ Sem credenciais (opcional)');
  }

  if (cfg.itadApiKey) {
    const itad = itadLookup('Hollow Knight', 367520);
    lines.push(`• IsThereAnyDeal v2: ${itad ? '✅ OK (R$ ' + itad.currentPrice + ' em ' + itad.bestStore + ')' : '❌ Chave inválida'}`);
  } else {
    lines.push('• IsThereAnyDeal v2: ⚪ Sem chave (opcional)');
  }

  SpreadsheetApp.getUi().alert('🔧 Diagnóstico das APIs', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
