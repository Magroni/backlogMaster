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
