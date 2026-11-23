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
