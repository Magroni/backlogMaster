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
