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
