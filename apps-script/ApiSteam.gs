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
