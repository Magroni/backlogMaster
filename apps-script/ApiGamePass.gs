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
