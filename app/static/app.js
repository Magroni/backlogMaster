/* ============================================================================
 * 🎮 GAME BACKLOG MASTER — FRONTEND SPA (ZERO LAG + LIVE PC TRACKER)
 * ============================================================================ */

const state = {
  games: [],
  wishlist: [],
  sessions: [],
  installed: [],
  settings: {},
  dashboard: null,
  live: null,
  libMode: 'grid',
  currentSearchGame: null,
  addDefaultDest: 'backlog',
  charts: {},
  lastCompletedAt: null,
};

// -------------------- HELPERS --------------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, type = 'ok') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTimer(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
}

function statusPill(st) {
  const map = {
    'Backlog': ['pill-cyan', '📌 Backlog'],
    'Jogando': ['pill-indigo', '🕹️ Jogando'],
    'Pausado': ['pill-amber', '⏸️ Pausado'],
    'Zerado': ['pill-green', '✅ Zerado'],
    '100% / Platina': ['pill-amber', '🏆 100%'],
    'Contínuo / MP': ['pill-indigo', '♾️ Contínuo'],
    'Dropado': ['pill-red', '💀 Dropado'],
  };
  const [cls, lbl] = map[st] || ['', st];
  return `<span class="pill ${cls}">${lbl}</span>`;
}

function storePill(st) {
  const map = {
    'Steam': 'pill-cyan',
    'Epic Games': 'pill-amber',
    'PC Game Pass': 'pill-green',
    'GOG': 'pill-pink',
  };
  return `<span class="pill ${map[st] || ''}">${esc(st)}</span>`;
}

// -------------------- NAVIGATION --------------------
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${name}"]`)?.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'library') loadGames();
  if (name === 'detector') { loadInstalledScan(false); loadRunningProcesses(); }
  if (name === 'wishlist') loadWishlist();
  if (name === 'hub') loadHub();
  if (name === 'sessions') loadSessions();
  if (name === 'settings') loadSettings();
}

// -------------------- LIVE PC TRACKER POLLING --------------------
async function pollLiveTracker() {
  try {
    const live = await api('/api/tracker/live');
    state.live = live;
    renderLiveWidget(live);
    document.getElementById('nav-count-installed').textContent = live.installed_known_count || 0;

    if (live.last_completed && live.last_completed.ended_at !== state.lastCompletedAt) {
      if (state.lastCompletedAt !== null) {
        toast(`✅ Sessão salva automaticamente: ${live.last_completed.title} (${live.last_completed.duration_minutes} min)`, 'ok');
        loadGames();
        loadDashboard();
      }
      state.lastCompletedAt = live.last_completed.ended_at;
    }
  } catch (e) {}
}

function renderLiveWidget(live) {
  const widget = document.getElementById('live-widget');
  const badge = document.getElementById('live-badge-text');
  const body = document.getElementById('live-body');
  const dashHero = document.getElementById('dash-now-playing-banner');
  const detHero = document.getElementById('detector-live-card');

  if (!live.enabled) {
    widget.className = 'live-widget paused';
    badge.textContent = 'Detector Pausado';
    body.innerHTML = `<div class="live-idle-msg">Ative em Configurações para rastrear automaticamente.</div>`;
    dashHero.style.display = 'none';
  } else if (live.active) {
    const a = live.active;
    widget.className = 'live-widget playing';
    badge.textContent = 'JOGANDO AGORA';
    body.innerHTML = `
      <div class="live-game-row">
        ${a.cover_url ? `<img src="${esc(a.cover_url)}" onerror="this.style.display='none'" />` : ''}
        <div style="min-width:0;flex:1">
          <div class="live-game-title">${esc(a.title)}</div>
          <div class="tiny-muted">${esc(a.store)} • ${esc(a.exe_name)}</div>
          <div class="live-timer" id="live-timer-val">${fmtTimer(a.elapsed_seconds)}</div>
        </div>
      </div>
      <button class="btn btn-xs btn-ghost btn-block" style="margin-top:8px" onclick="stopLiveSession()">⏹ Encerrar & Salvar</button>
    `;
    dashHero.style.display = 'flex';
    dashHero.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        ${a.cover_url ? `<img src="${esc(a.cover_url)}" style="width:52px;height:68px;object-fit:cover;border-radius:8px" />` : ''}
        <div>
          <div class="pill pill-green" style="margin-bottom:4px">🟢 DETECTADO AO VIVO NO PC</div>
          <div style="font-size:18px;font-weight:800">${esc(a.title)}</div>
          <div class="muted small">${esc(a.store)} • Processo: <code>${esc(a.exe_name)}</code></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:800;color:#34d399">${fmtTimer(a.elapsed_seconds)}</div>
        <button class="btn btn-ghost" onclick="stopLiveSession()">⏹ Finalizar Sessão</button>
      </div>
    `;
  } else {
    widget.className = 'live-widget idle';
    badge.textContent = 'Detector PC Ativo';
    body.innerHTML = `<div class="live-idle-msg">Abra qualquer jogo da Steam, Epic ou Game Pass para rastrear automaticamente.</div>`;
    dashHero.style.display = 'none';
  }

  if (detHero) {
    if (live.active) {
      detHero.innerHTML = `
        <div>
          <div class="pill pill-green">🟢 JOGO DETECTADO EM EXECUÇÃO</div>
          <h2 style="margin-top:6px">${esc(live.active.title)}</h2>
          <p class="muted small">Processo: <code>${esc(live.active.exe_name)}</code> • Tempo decorrido: <strong style="color:#34d399">${fmtTimer(live.active.elapsed_seconds)}</strong></p>
        </div>
        <button class="btn btn-danger" onclick="stopLiveSession()">⏹ Parar e Salvar Sessão Agora</button>
      `;
    } else {
      detHero.innerHTML = `
        <div>
          <div class="pill ${live.enabled ? 'pill-cyan' : 'pill-red'}">${live.enabled ? '📡 MONITORAMENTO EM SEGUNDO PLANO ATIVO' : '⏸️ DETECTOR DESATIVADO'}</div>
          <h3 style="margin-top:8px">Nenhum jogo em execução no momento</h3>
          <p class="muted small">Janela ativa: <code>${esc(live.foreground_window || 'Desktop')}</code> • Jogos instalados mapeados: <strong>${live.installed_known_count}</strong></p>
        </div>
        <button class="btn btn-ghost" onclick="switchView('settings')">⚙️ Ajustar Detector</button>
      `;
    }
  }
}

async function stopLiveSession() {
  await api('/api/tracker/stop-session', { method: 'POST' });
  toast('Sessão finalizada e salva!');
  pollLiveTracker();
  loadGames();
}

// -------------------- DASHBOARD --------------------
async function loadDashboard() {
  const d = await api('/api/dashboard');
  state.dashboard = d;
  const k = d.kpis;

  document.getElementById('nav-count-games').textContent = k.total;
  document.getElementById('nav-count-wl').textContent = d.wishlist_radar.total;
  document.getElementById('dash-subtitle').textContent =
    `${k.total} jogos no acervo (${k.installed} instalados no PC) • ${d.goal.completed}/${d.goal.target} zerados em ${d.goal.year} • Ritmo: ${d.goal.hours_per_week}h/semana`;

  // Alert if backlog games are leaving Game Pass
  const alertEl = document.getElementById('dash-leaving-alert');
  if (d.gamepass_roi.leaving_alerts && d.gamepass_roi.leaving_alerts.length > 0) {
    alertEl.style.display = 'flex';
    alertEl.innerHTML = `
      <div>🚨 <strong>ATENÇÃO PC GAME PASS:</strong> ${d.gamepass_roi.leaving_alerts.map(x => esc(x.title)).join(', ')} está(ão) na sua fila e saindo do catálogo em breve!</div>
      <button class="btn btn-xs btn-danger" onclick="switchView('hub')">Ver Detalhes</button>
    `;
  } else {
    alertEl.style.display = 'none';
  }

  // 6 KPI Cards
  const kpisHtml = [
    ['📚 Total no Acervo', k.total, `${k.backlog} no Backlog • ${k.installed} instalados`, '#6366f1'],
    ['🕹️ Jogando Agora', k.playing, `${k.paused} pausados`, '#0ea5e9'],
    ['🏆 Zerados / 100%', k.beaten, `${k.completion_pct}% conclusão • ${k.platinums} platinas`, '#10b981'],
    ['⏳ Horas no Backlog', `${k.remaining_hours} h`, `~${k.months_left} meses (${k.weeks_left} sem)`, '#f59e0b'],
    ['💰 Investido Total', fmtMoney(k.total_spent), `${fmtMoney(k.cost_per_hour)} / hora jogada`, '#a855f7'],
    ['💸 Parado no Backlog', fmtMoney(k.unplayed_money), k.avg_rating ? `⭐ Nota média: ${k.avg_rating}/10` : 'Sem notas ainda', '#f43f5e'],
  ].map(([lbl, val, sub, color]) => `
    <div class="kpi-card" style="--accent:${color}">
      <div class="kpi-label">${lbl}</div>
      <div class="kpi-val">${val}</div>
      <div class="kpi-sub">${sub}</div>
    </div>
  `).join('');
  document.getElementById('dash-kpis').innerHTML = kpisHtml;

  // Goal
  document.getElementById('goal-badge').textContent = `${d.goal.completed} / ${d.goal.target} (${d.goal.pct}%)`;
  document.getElementById('goal-content').innerHTML = `
    <div class="progress-track" style="height:12px;margin-bottom:14px">
      <div class="progress-fill" style="width:${d.goal.pct}%"></div>
    </div>
    <div class="stat-row"><span class="muted">Total de horas jogadas</span><strong>${k.total_hours_played} h</strong></div>
    <div class="stat-row"><span class="muted">PC Game Pass ROI</span><strong>${d.gamepass_roi.hours}h jogadas (${d.gamepass_roi.cost_per_hour ? fmtMoney(d.gamepass_roi.cost_per_hour) + '/h' : '—'})</strong></div>
    <div class="stat-row"><span class="muted">Tempo estimado p/ zerar fila</span><strong>${k.months_left} meses (${d.goal.hours_per_week}h/sem)</strong></div>
  `;

  // Wishlist Radar
  const wr = d.wishlist_radar;
  document.getElementById('wl-radar-content').innerHTML = `
    <div class="stat-row"><span class="muted">🎮 Já inclusos no PC Game Pass</span><span class="pill pill-green">${wr.on_gamepass}</span></div>
    <div class="stat-row"><span class="muted">🎯 Prontos p/ comprar (≤ Preço Alvo)</span><span class="pill pill-pink">${wr.buy_now}</span></div>
    <div class="stat-row"><span class="muted">🔥 Em Menor Preço Histórico</span><span class="pill pill-amber">${wr.hist_low}</span></div>
    <div class="stat-row"><span class="muted">Custo atual total da Wishlist</span><strong>${fmtMoney(wr.total_cost)}</strong></div>
  `;

  // Top 5 Next Games
  const top5El = document.getElementById('dash-top5');
  if (!d.top5.length) {
    top5El.innerHTML = `<div class="empty-state"><p>Adicione jogos ou clique em <strong>📡 Escanear Jogos no PC</strong> para gerar recomendações!</p></div>`;
  } else {
    top5El.innerHTML = `
      <table class="data-table">
        <thead><tr><th>#</th><th>Jogo</th><th>Loja</th><th>HLTB</th><th>Score</th><th></th></tr></thead>
        <tbody>
          ${d.top5.map((g, i) => `
            <tr style="cursor:pointer" onclick="openDrawer(${g.id})">
              <td><strong style="color:#818cf8">#${i + 1}</strong></td>
              <td><strong>${esc(g.title)}</strong> ${g.installed ? '<span title="Instalado no PC">💻</span>' : ''}</td>
              <td>${storePill(g.store)}</td>
              <td>${g.target_hltb ? g.target_hltb + 'h' : '—'}</td>
              <td><span class="pill pill-green">${g.next_score}</span></td>
              <td>${g.installed || g.steam_appid ? `<button class="btn btn-xs btn-primary" onclick="event.stopPropagation();launchGame(${g.id})">▶</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // Hall of Fame
  const hof = d.hall_of_fame;
  const hofItems = [
    ['🥇 Melhor Nota Pessoal', hof.best_rated],
    ['⏱️ Mais Jogado', hof.most_played],
    ['⚡ Quick Win (Mais Curto)', hof.quick_win],
    ['💎 Melhor Custo/Hora', hof.best_value],
  ];
  document.getElementById('dash-hof').innerHTML = hofItems.map(([lbl, it]) => `
    <div class="stat-row">
      <div><div class="tiny-muted">${lbl}</div><strong>${it ? esc(it.title) : '—'}</strong></div>
      <span class="pill pill-indigo">${it ? esc(it.value) : '—'}</span>
    </div>
  `).join('');

  renderCharts(d.charts);
}

function renderCharts(ch) {
  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,.08)' } },
      y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,.08)' }, beginAtZero: true },
    },
  };

  const mk = (id, config) => {
    if (state.charts[id]) state.charts[id].destroy();
    const ctx = document.getElementById(id);
    if (ctx) state.charts[id] = new Chart(ctx, config);
  };

  mk('chart-status', {
    type: 'bar',
    data: {
      labels: ch.status.labels,
      datasets: [{ label: 'Jogos', data: ch.status.values, backgroundColor: ['#0ea5e9', '#6366f1', '#f59e0b', '#10b981', '#eab308', '#8b5cf6', '#f43f5e'], borderRadius: 6 }],
    },
    options: { ...commonOpts, indexAxis: 'y', plugins: { legend: { display: false } } },
  });

  mk('chart-stores', {
    type: 'bar',
    data: {
      labels: ch.stores.labels,
      datasets: [
        { label: 'Total', data: ch.stores.total, backgroundColor: '#0ea5e9', borderRadius: 6 },
        { label: 'Zerados', data: ch.stores.beaten, backgroundColor: '#10b981', borderRadius: 6 },
      ],
    },
    options: commonOpts,
  });

  mk('chart-monthly', {
    type: 'bar',
    data: {
      labels: ch.monthly.labels,
      datasets: [
        { label: 'Horas (Sessões)', data: ch.monthly.hours, backgroundColor: 'rgba(99,102,241,.7)', borderRadius: 6 },
        { label: 'Zerados', data: ch.monthly.beaten, type: 'line', borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.3 },
      ],
    },
    options: commonOpts,
  });

  mk('chart-hltb', {
    type: 'bar',
    data: {
      labels: ch.hltb_bands.labels,
      datasets: [
        { label: 'No Backlog', data: ch.hltb_bands.backlog, backgroundColor: '#ec4899', borderRadius: 6 },
        { label: 'Zerados', data: ch.hltb_bands.beaten, backgroundColor: '#10b981', borderRadius: 6 },
      ],
    },
    options: commonOpts,
  });
}

// -------------------- LIBRARY --------------------
async function loadGames() {
  const res = await api('/api/games');
  state.games = res.games || [];
  document.getElementById('nav-count-games').textContent = state.games.length;
  renderLibrary();
}

function setLibMode(mode) {
  state.libMode = mode;
  document.getElementById('btn-mode-grid').classList.toggle('active', mode === 'grid');
  document.getElementById('btn-mode-table').classList.toggle('active', mode === 'table');
  renderLibrary();
}

function getFilteredGames() {
  const q = (document.getElementById('lib-search')?.value || '').toLowerCase().trim();
  const st = document.getElementById('lib-status')?.value || 'ALL';
  const store = document.getElementById('lib-store')?.value || 'ALL';
  const sort = document.getElementById('lib-sort')?.value || 'score';
  const instOnly = document.getElementById('lib-installed-only')?.checked;

  let list = state.games.filter(g => {
    if (q && !g.title.toLowerCase().includes(q) && !(g.genre || '').toLowerCase().includes(q)) return false;
    if (st !== 'ALL' && g.status !== st) return false;
    if (store !== 'ALL' && g.store !== store) return false;
    if (instOnly && !g.installed) return false;
    return true;
  });

  const sorters = {
    score: (a, b) => (b.next_score ?? -1) - (a.next_score ?? -1),
    updated: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
    hltb_asc: (a, b) => (a.target_hltb ?? 9999) - (b.target_hltb ?? 9999),
    hours_desc: (a, b) => (b.hours_played || 0) - (a.hours_played || 0),
    critic_desc: (a, b) => (b.critic_score || 0) - (a.critic_score || 0),
    title: (a, b) => a.title.localeCompare(b.title),
  };
  list.sort(sorters[sort] || sorters.score);
  return list;
}

function renderLibrary() {
  const container = document.getElementById('lib-container');
  const list = getFilteredGames();

  if (!list.length) {
    container.innerHTML = `
      <div class="card empty-state">
        <div class="empty-icon">🎮</div>
        <h3>Nenhum jogo aqui ainda</h3>
        <p style="margin:8px 0 16px">Você pode escanear automaticamente os jogos já instalados neste PC (Steam, Epic e Game Pass) ou adicionar um jogo pela busca!</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-green" onclick="switchView('detector'); loadInstalledScan(true)">📡 Escanear Jogos Instalados no PC</button>
          <button class="btn btn-primary" onclick="openAddModal()">＋ Buscar & Adicionar Jogo</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.libMode === 'table') {
    container.innerHTML = `
      <div class="card" style="overflow-x:auto">
        <table class="data-table">
          <thead><tr><th></th><th>Título</th><th>Status</th><th>Loja</th><th>HLTB</th><th>Jogado</th><th>Restante</th><th>Crítica</th><th>Score</th><th>Ações</th></tr></thead>
          <tbody>
            ${list.map(g => `
              <tr style="cursor:pointer" onclick="openDrawer(${g.id})">
                <td>${g.cover_url ? `<img class="mini-cover" src="${esc(g.cover_url)}" onerror="this.style.display='none'" />` : ''}</td>
                <td><strong>${esc(g.title)}</strong> ${g.installed ? '💻' : ''}<div class="tiny-muted">${esc(g.genre || '')} ${g.release_year || ''}</div></td>
                <td>${statusPill(g.status)}</td>
                <td>${storePill(g.store)}</td>
                <td>${g.target_hltb ? g.target_hltb + 'h' : '—'}</td>
                <td>${g.hours_played || 0}h</td>
                <td>${g.remaining_hours}h</td>
                <td>${g.critic_score || '—'}</td>
                <td>${g.next_score ? `<span class="pill pill-indigo">${g.next_score}</span>` : '—'}</td>
                <td>
                  <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();enrichSingle(${g.id})" title="Enriquecer HLTB/Steam">⚡</button>
                  ${g.installed || g.steam_appid ? `<button class="btn btn-xs btn-primary" onclick="event.stopPropagation();launchGame(${g.id})" title="Iniciar no PC">▶</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="games-grid">
      ${list.map(g => `
        <div class="game-card" onclick="openDrawer(${g.id})">
          <div class="cover-box">
            ${g.cover_url
              ? `<img src="${esc(g.cover_url)}" loading="lazy" onerror="this.outerHTML='<div class=cover-fallback>${esc(g.title)}</div>'" />`
              : `<div class="cover-fallback">${esc(g.title)}</div>`}
            <div class="cover-top-badges">
              ${storePill(g.store)}
              ${g.installed ? '<span class="pill pill-green">💻 PC</span>' : ''}
            </div>
            <div class="cover-bottom-bar">
              ${statusPill(g.status)}
              ${g.critic_score ? `<span class="pill ${g.critic_score >= 85 ? 'pill-green' : 'pill-amber'}">⭐ ${g.critic_score}</span>` : ''}
            </div>
          </div>
          <div class="card-body">
            <div class="card-title">${esc(g.title)}</div>
            <div class="card-meta">
              <span>⏱️ ${g.hours_played || 0}h / ${g.target_hltb ? g.target_hltb + 'h' : '?'}</span>
              <span>${g.next_score ? '🧠 ' + g.next_score : (g.my_rating ? '⭐ ' + g.my_rating : '')}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${g.progress_pct}%"></div></div>
            <div class="card-actions">
              ${g.installed || g.steam_appid
                ? `<button class="btn btn-xs btn-primary" style="flex:1" onclick="event.stopPropagation();launchGame(${g.id})">▶ Jogar</button>`
                : `<button class="btn btn-xs btn-ghost" style="flex:1" onclick="event.stopPropagation();openDrawer(${g.id})">✏️ Detalhes</button>`}
              <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();enrichSingle(${g.id})" title="Buscar HLTB + Steam + ProtonDB">⚡</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function enrichSingle(id) {
  toast('Buscando HLTB, Steam e ProtonDB...');
  try {
    await api(`/api/games/${id}/enrich`, { method: 'POST' });
    toast('✅ Jogo enriquecido com sucesso!');
    await loadGames();
    if (document.getElementById('detail-drawer').classList.contains('open')) openDrawer(id);
  } catch (e) { toast(e.message, 'err'); }
}

async function enrichMissingBatch() {
  const btn = document.getElementById('btn-enrich-batch');
  btn.disabled = true; btn.textContent = '⏳ Enriquecendo...';
  try {
    const res = await api('/api/games/enrich-missing', { method: 'POST' });
    toast(`✅ ${res.enriched} jogo(s) enriquecido(s) via HLTB + Steam!`);
    await loadGames();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '⚡ Enriquecer Faltantes (HLTB/Steam)';
}

async function launchGame(id) {
  try {
    const res = await api(`/api/games/${id}/launch`, { method: 'POST' });
    if (res.ok) toast('🚀 Iniciando jogo! O Detector PC começará a contar o tempo automaticamente.');
    else toast(res.error || 'Não foi possível abrir o jogo', 'err');
  } catch (e) { toast(e.message, 'err'); }
}

// -------------------- DETAIL DRAWER --------------------
function openDrawer(id) {
  const g = state.games.find(x => x.id === id);
  if (!g) return;
  const drawer = document.getElementById('detail-drawer');
  const content = document.getElementById('drawer-content');

  content.innerHTML = `
    <div class="modal-head">
      <h2>${esc(g.title)}</h2>
      <button class="icon-btn" onclick="closeDrawer()">✕</button>
    </div>
    ${g.banner_url || g.cover_url ? `<img src="${esc(g.banner_url || g.cover_url)}" style="width:100%;height:170px;object-fit:cover;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'" />` : ''}
    <div class="pill-wrap">
      ${statusPill(g.status)}
      ${storePill(g.store)}
      ${g.installed ? '<span class="pill pill-green">💻 Instalado</span>' : ''}
      ${g.protondb_tier ? `<span class="pill pill-indigo">Deck/Linux: ${esc(g.protondb_tier)}</span>` : ''}
      ${g.hltb_url ? `<a class="pill pill-amber" href="${esc(g.hltb_url)}" target="_blank">⏱️ Abrir no HLTB ↗</a>` : ''}
    </div>

    <div class="btn-row" style="margin-bottom:16px">
      ${g.installed || g.steam_appid ? `<button class="btn btn-primary" onclick="launchGame(${g.id})">▶ Iniciar no PC</button>` : ''}
      <button class="btn btn-ghost" onclick="enrichSingle(${g.id})">⚡ Enriquecer HLTB/Steam</button>
      <button class="btn btn-danger" onclick="deleteGame(${g.id})">🗑️ Excluir</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Status</label>
        <select id="ed-status" class="select">
          ${['Backlog','Jogando','Pausado','Zerado','100% / Platina','Contínuo / MP','Dropado'].map(s => `<option ${g.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Prioridade (1-5)</label>
        <select id="ed-prio" class="select">
          ${[[1,'🔥 1 - Urgente'],[2,'⭐ 2 - Alta'],[3,'👍 3 - Média'],[4,'🧊 4 - Baixa'],[5,'💤 5 - Talvez']].map(([v,l]) => `<option value="${v}" ${g.priority==v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Loja / Launcher</label>
        <select id="ed-store" class="select">
          ${['Steam','Epic Games','PC Game Pass','GOG','Amazon Prime','EA Play','Outro'].map(s => `<option ${g.store===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Gênero</label>
        <input id="ed-genre" class="input" value="${esc(g.genre || '')}" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Horas Jogadas</label>
        <input id="ed-hours" type="number" step="0.1" class="input" value="${g.hours_played || 0}" />
      </div>
      <div class="form-group">
        <label>Minha Nota (0-10)</label>
        <input id="ed-rating" type="number" step="0.5" min="0" max="10" class="input" value="${g.my_rating ?? ''}" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>HLTB Main (h)</label><input id="ed-hm" type="number" step="0.5" class="input" value="${g.hltb_main ?? ''}" /></div>
      <div class="form-group"><label>HLTB Extra (h)</label><input id="ed-he" type="number" step="0.5" class="input" value="${g.hltb_extra ?? ''}" /></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>HLTB 100% (h)</label><input id="ed-hc" type="number" step="0.5" class="input" value="${g.hltb_comp ?? ''}" /></div>
      <div class="form-group"><label>Preço Pago (R$)</label><input id="ed-price" type="number" step="0.01" class="input" value="${g.price_paid || 0}" /></div>
    </div>

    <div class="form-group">
      <label>Executável Vinculado p/ Auto-Detecção (.exe)</label>
      <input id="ed-exe" class="input" value="${esc(g.exe_name || '')}" placeholder="Ex: eldenring.exe" />
      ${g.install_dir ? `<div class="tiny-muted" style="margin-top:4px">Pasta: <code>${esc(g.install_dir)}</code></div>` : ''}
    </div>

    <div class="form-group">
      <label>Anotações / Review</label>
      <textarea id="ed-notes" class="input" rows="3">${esc(g.notes || '')}</textarea>
    </div>

    <button class="btn btn-green btn-block" onclick="saveDrawer(${g.id})">💾 Salvar Alterações</button>
  `;
  drawer.classList.add('open');
}

function closeDrawer() {
  document.getElementById('detail-drawer').classList.remove('open');
}

async function saveDrawer(id) {
  const numOrNull = el => el.value === '' ? null : Number(el.value);
  const payload = {
    status: document.getElementById('ed-status').value,
    priority: Number(document.getElementById('ed-prio').value),
    store: document.getElementById('ed-store').value,
    genre: document.getElementById('ed-genre').value,
    hours_played: Number(document.getElementById('ed-hours').value) || 0,
    my_rating: numOrNull(document.getElementById('ed-rating')),
    hltb_main: numOrNull(document.getElementById('ed-hm')),
    hltb_extra: numOrNull(document.getElementById('ed-he')),
    hltb_comp: numOrNull(document.getElementById('ed-hc')),
    price_paid: Number(document.getElementById('ed-price').value) || 0,
    exe_name: document.getElementById('ed-exe').value.trim(),
    notes: document.getElementById('ed-notes').value,
  };
  await api(`/api/games/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  toast('✅ Jogo salvo!');
  closeDrawer();
  await loadGames();
}

async function deleteGame(id) {
  if (!confirm('Remover este jogo do seu Backlog?')) return;
  await api(`/api/games/${id}`, { method: 'DELETE' });
  toast('Jogo removido.');
  closeDrawer();
  loadGames();
}

// -------------------- DETECTOR PC & INSTALLED SCANNER --------------------
async function loadInstalledScan(force = false) {
  const res = await api(`/api/scanner/installed?force=${force}`);
  state.installed = res.installed || [];
  document.getElementById('inst-count').textContent = state.installed.length;
  document.getElementById('nav-count-installed').textContent = state.installed.length;

  const listEl = document.getElementById('installed-list');
  if (!state.installed.length) {
    listEl.innerHTML = `<div class="empty-state">Nenhum jogo instalado encontrado nas pastas padrão da Steam, Epic ou XboxGames. Você pode adicionar pastas extras em Configurações!</div>`;
    return;
  }

  listEl.innerHTML = state.installed.map(it => `
    <div class="inst-card">
      ${it.cover_url ? `<img src="${esc(it.cover_url)}" onerror="this.style.display='none'" />` : `<div style="width:52px;height:68px;border-radius:8px;background:#1e293b;display:grid;place-items:center">🎮</div>`}
      <div class="inst-info">
        <div class="inst-title">${esc(it.title)}</div>
        <div class="pill-wrap" style="margin:4px 0">${storePill(it.store)} ${it.in_backlog ? '<span class="pill pill-green">✓ No Backlog</span>' : ''}</div>
        <div class="inst-exe" title="${esc(it.exe_path || it.install_dir)}">${esc(it.exe_name || 'Pasta mapeada')}</div>
      </div>
      ${!it.in_backlog ? `<button class="btn btn-xs btn-primary" onclick="importSingleInstalled('${esc(it.title).replace(/'/g, "\\'")}')">＋</button>` : ''}
    </div>
  `).join('');
}

async function importAllInstalled() {
  const btn = document.getElementById('btn-import-all-inst');
  btn.disabled = true; btn.textContent = '⏳ Importando...';
  try {
    const res = await api('/api/scanner/import-installed', { method: 'POST', body: '{}' });
    toast(`✅ ${res.added} jogo(s) importado(s) e ${res.updated} vinculado(s) para auto-detecção!`);
    await loadInstalledScan(false);
    await loadGames();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '📥 Importar Todos Instalados p/ Backlog';
}

async function importSingleInstalled(title) {
  const res = await api('/api/scanner/import-installed', { method: 'POST', body: JSON.stringify({ titles: [title] }) });
  toast(`✅ "${title}" adicionado e vinculado ao Detector PC!`);
  await loadInstalledScan(false);
  await loadGames();
}

async function loadRunningProcesses() {
  const res = await api('/api/tracker/processes');
  const procs = res.processes || [];
  const el = document.getElementById('running-procs-list');
  if (!procs.length) {
    el.innerHTML = `<div class="muted small">Nenhum processo de jogo/usuário detectado no momento.</div>`;
    return;
  }
  const gameOpts = state.games.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Processo (.exe)</th><th>Caminho</th><th>Vincular ao Jogo</th></tr></thead>
      <tbody>
        ${procs.slice(0, 20).map((p, i) => `
          <tr>
            <td><code>${esc(p.exe_name)}</code></td>
            <td class="tiny-muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.exe_path || '—')}</td>
            <td style="display:flex;gap:6px">
              <select id="bind-sel-${i}" class="select" style="padding:5px 8px">${gameOpts || '<option>Adicione jogos primeiro</option>'}</select>
              <button class="btn btn-xs btn-primary" onclick="bindProcess(${i}, '${esc(p.exe_name).replace(/'/g,"\\'")}', '${esc(p.exe_path).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}', '${esc(p.install_dir).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}')">🔗 Vincular</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function bindProcess(idx, exeName, exePath, installDir) {
  const gid = Number(document.getElementById(`bind-sel-${idx}`).value);
  if (!gid) return;
  await api(`/api/games/${gid}/bind-exe`, { method: 'POST', body: JSON.stringify({ exe_name: exeName, exe_path: exePath, install_dir: installDir }) });
  toast(`🔗 ${exeName} vinculado! O Detector PC já vai rastrear esse jogo automaticamente.`);
  loadGames();
}

// -------------------- WISHLIST --------------------
async function loadWishlist() {
  const res = await api('/api/wishlist');
  state.wishlist = res.wishlist || [];
  document.getElementById('nav-count-wl').textContent = state.wishlist.length;
  const el = document.getElementById('wishlist-container');

  if (!state.wishlist.length) {
    el.innerHTML = `<div class="card empty-state" style="grid-column:1/-1"><div class="empty-icon">🏷️</div><h3>Sua Wishlist está vazia</h3><p style="margin:8px 0 14px">Adicione jogos para monitorar preços, menor histórico e saber automaticamente se entram no PC Game Pass!</p><button class="btn btn-pink" onclick="openAddModal('wishlist')">＋ Adicionar à Wishlist</button></div>`;
    return;
  }

  el.innerHTML = state.wishlist.map(w => {
    const isGP = w.signal === 'JÁ NO GAME PASS';
    const isBuy = w.signal === 'COMPRAR AGORA';
    const sigBadge = isGP
      ? '<span class="pill pill-green">🎮 JÁ NO PC GAME PASS!</span>'
      : isBuy ? '<span class="pill pill-pink">🎯 COMPRAR AGORA!</span>'
      : w.signal === 'MENOR HISTÓRICO' ? '<span class="pill pill-amber">🔥 MENOR HISTÓRICO</span>'
      : `<span class="pill">${w.signal}</span>`;

    return `
      <div class="wl-card ${isGP ? 'gp-hit' : isBuy ? 'buy-hit' : ''}">
        ${w.cover_url ? `<img class="wl-banner" src="${esc(w.cover_url)}" onerror="this.style.display='none'" />` : ''}
        <div class="wl-body">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <strong style="font-size:15px">${esc(w.title)}</strong>
            <button class="icon-btn" onclick="deleteWishlist(${w.id})">✕</button>
          </div>
          <div class="pill-wrap">${sigBadge} ${w.discount_pct > 0 ? `<span class="pill pill-green">-${Math.round(w.discount_pct)}%</span>` : ''} ${w.hltb_est ? `<span class="pill">⏱️ ${w.hltb_est}h</span>` : ''}</div>
          <div class="price-line">
            <span class="price-now">${fmtMoney(w.current_price)}</span>
            ${w.full_price && w.full_price > (w.current_price || 0) ? `<span class="price-old">${fmtMoney(w.full_price)}</span>` : ''}
            <span class="tiny-muted">${esc(w.best_store || '')}</span>
          </div>
          <div class="tiny-muted">Menor histórico: <strong>${fmtMoney(w.historical_low)}</strong> • Alvo: <strong>${fmtMoney(w.target_price)}</strong> ${w.cost_per_hour ? `• ${fmtMoney(w.cost_per_hour)}/h` : ''}</div>
          <div class="btn-row" style="margin-top:auto">
            ${w.deal_url ? `<a class="btn btn-xs btn-ghost" href="${esc(w.deal_url)}" target="_blank">🛒 Loja ↗</a>` : ''}
            <button class="btn btn-xs btn-green" onclick="moveWlToBacklog(${w.id})">➕ Mover p/ Backlog</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshAllWishlist() {
  const btn = document.getElementById('btn-wl-refresh');
  btn.disabled = true; btn.textContent = '⏳ Consultando APIs...';
  try {
    const res = await api('/api/wishlist/refresh-all', { method: 'POST' });
    toast(`✅ ${res.updated} jogo(s) atualizados com Steam, CheapShark e PC Game Pass!`);
    loadWishlist();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '🔄 Atualizar Preços & Game Pass';
}

async function importSteamWishlist() {
  const btn = document.getElementById('btn-wl-steam');
  btn.disabled = true; btn.textContent = '⏳ Importando...';
  try {
    const res = await api('/api/steam/import-wishlist', { method: 'POST' });
    toast(`✅ ${res.added} jogo(s) importado(s) da sua Wishlist Steam!`);
    loadWishlist();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '📥 Importar Wishlist Steam';
}

async function moveWlToBacklog(id) {
  await api(`/api/wishlist/${id}/move-to-backlog`, { method: 'POST' });
  toast('🎮 Jogo movido para o Backlog!');
  loadWishlist();
  loadGames();
}

async function deleteWishlist(id) {
  await api(`/api/wishlist/${id}`, { method: 'DELETE' });
  loadWishlist();
}

// -------------------- HUB: GAME PASS & EPIC --------------------
async function loadHub() {
  const [hub, dash] = await Promise.all([api('/api/hub/free-and-gamepass'), api('/api/dashboard')]);
  const gp = dash.gamepass_roi;

  document.getElementById('hub-roi-card').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
      <div>
        <div class="pill pill-green">💳 ROI DO PC GAME PASS</div>
        <h2 style="margin-top:6px">${gp.games_count} jogos no acervo • ${gp.beaten_count} zerados • ${gp.hours}h jogadas</h2>
        <p class="muted small">Mensalidade: ${fmtMoney(gp.monthly)} (${fmtMoney(gp.annual)}/ano) → Custo real por hora jogada: <strong style="color:#34d399">${gp.cost_per_hour ? fmtMoney(gp.cost_per_hour) + '/h' : 'Jogue seu 1º jogo no Game Pass!'}</strong></p>
      </div>
      <button class="btn btn-xs btn-ghost" onclick="switchView('settings')">Editar mensalidade</button>
    </div>
  `;

  const lvEl = document.getElementById('hub-gp-leaving');
  if (!hub.gamepass_leaving.length) {
    lvEl.innerHTML = `<div class="muted small">Clique em <strong>🚨 Atualizar Saindo do Game Pass</strong> acima para puxar a lista ao vivo da Microsoft!</div>`;
  } else {
    lvEl.innerHTML = hub.gamepass_leaving.map(x => `
      <div class="wl-card ${x.in_backlog ? 'buy-hit' : ''}">
        ${x.cover_url ? `<img class="wl-banner" src="${esc(x.cover_url)}" onerror="this.style.display='none'" />` : ''}
        <div class="wl-body">
          <strong>${esc(x.title)}</strong>
          <div class="pill-wrap">
            <span class="pill pill-red">🚨 Saindo em Breve</span>
            ${x.in_backlog ? '<span class="pill pill-red">⚠️ ESTÁ NO SEU BACKLOG!</span>' : ''}
          </div>
          <div class="tiny-muted">${esc(x.publisher || '')}</div>
          <a class="btn btn-xs btn-ghost" style="margin-top:auto" href="${esc(x.store_url)}" target="_blank">Ver no Xbox/PC ↗</a>
        </div>
      </div>
    `).join('');
  }

  const epEl = document.getElementById('hub-epic-list');
  if (!hub.epic_freebies.length) {
    epEl.innerHTML = `<div class="muted small">Clique em <strong>🎁 Atualizar Grátis da Epic</strong> acima para buscar os jogos gratuitos desta semana!</div>`;
  } else {
    epEl.innerHTML = hub.epic_freebies.map(x => `
      <div class="wl-card ${x.status==='GRÁTIS AGORA' ? 'gp-hit' : ''}">
        ${x.cover_url ? `<img class="wl-banner" src="${esc(x.cover_url)}" onerror="this.style.display='none'" />` : ''}
        <div class="wl-body">
          <strong>${esc(x.title)}</strong>
          <div class="pill-wrap">
            <span class="pill ${x.status==='GRÁTIS AGORA'?'pill-green':'pill-amber'}">${x.status}</span>
            ${x.original_price ? `<span class="pill">${esc(x.original_price)}</span>` : ''}
            ${x.end_date ? `<span class="pill">Até ${esc(x.end_date)}</span>` : ''}
          </div>
          <p class="tiny-muted">${esc(x.description || '')}</p>
          <div class="btn-row" style="margin-top:auto">
            <a class="btn btn-xs btn-primary" href="${esc(x.store_url)}" target="_blank">🎁 Resgatar na Epic ↗</a>
            <button class="btn btn-xs ${x.claimed ? 'btn-green' : 'btn-ghost'}" onclick="toggleEpicClaim(${x.id}, ${x.claimed ? 0 : 1})">${x.claimed ? '✓ Resgatado' : 'Marcar Resgatado'}</button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function syncEpicFreebies() {
  const btn = document.getElementById('btn-sync-epic');
  btn.disabled = true; btn.textContent = '⏳ Buscando Epic...';
  try {
    const res = await api('/api/hub/sync-epic', { method: 'POST' });
    toast(`🎁 ${res.count} jogo(s) grátis da Epic atualizados!`);
    loadHub();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '🎁 Atualizar Grátis da Epic';
}

async function syncGamePassLeaving() {
  const btn = document.getElementById('btn-sync-gp');
  btn.disabled = true; btn.textContent = '⏳ Consultando Microsoft...';
  try {
    const res = await api('/api/hub/sync-gamepass-leaving', { method: 'POST' });
    toast(`🚨 ${res.count} jogo(s) saindo do PC Game Pass encontrados!`);
    loadHub();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '🚨 Atualizar Saindo do Game Pass';
}

async function toggleEpicClaim(id, claimed) {
  await api(`/api/hub/epic/${id}/claim?claimed=${claimed}`, { method: 'POST' });
  loadHub();
}

// -------------------- ROULETTE --------------------
async function spinRoulette() {
  const maxH = Number(document.getElementById('r-max-hours').value);
  const res = await api('/api/roulette', {
    method: 'POST',
    body: JSON.stringify({
      max_hours: maxH >= 150 ? 999 : maxH,
      store: document.getElementById('r-store').value,
      only_installed: document.getElementById('r-installed').checked,
      only_high_priority: document.getElementById('r-highprio').checked,
    }),
  });
  const stage = document.getElementById('roulette-stage');
  if (!res.ok) {
    stage.innerHTML = `<div class="empty-state"><div class="empty-icon">😅</div><p>${esc(res.message)}</p></div>`;
    return;
  }
  const p = res.picked;
  stage.innerHTML = `
    <div class="pill pill-indigo" style="margin-bottom:10px">🎯 SORTEADO ENTRE ${res.total_candidates} JOGOS</div>
    ${p.cover_url ? `<img class="roulette-cover" src="${esc(p.cover_url)}" onerror="this.style.display='none'" />` : ''}
    <h2 style="font-size:22px;margin-bottom:6px">${esc(p.title)}</h2>
    <div class="pill-wrap" style="justify-content:center">
      ${storePill(p.store)}
      ${p.target_hltb ? `<span class="pill">⏱️ ${p.target_hltb}h</span>` : ''}
      ${p.critic_score ? `<span class="pill pill-green">⭐ ${p.critic_score}</span>` : ''}
      <span class="pill pill-indigo">🧠 Score ${p.next_score}</span>
    </div>
    <div class="btn-row" style="justify-content:center;margin-top:16px">
      ${p.installed || p.steam_appid ? `<button class="btn btn-primary" onclick="launchGame(${p.id})">▶ Abrir Jogo no PC!</button>` : ''}
      <button class="btn btn-green" onclick="markPlaying(${p.id})">🕹️ Marcar como Jogando</button>
    </div>
  `;
}

async function markPlaying(id) {
  await api(`/api/games/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Jogando' }) });
  toast('🕹️ Marcado como Jogando! Boa jogatina!');
  loadGames();
}

// -------------------- SESSIONS --------------------
async function loadSessions() {
  if (!state.games.length) await loadGames();
  const res = await api('/api/sessions');
  state.sessions = res.sessions || [];
  const sel = document.getElementById('sess-game');
  sel.innerHTML = state.games.map(g => `<option value="${g.id}" data-title="${esc(g.title)}">${esc(g.title)} (${esc(g.status)})</option>`).join('');

  const el = document.getElementById('sessions-list');
  if (!state.sessions.length) {
    el.innerHTML = `<div class="empty-state"><p>Nenhuma sessão registrada ainda. Assim que você abrir e fechar qualquer jogo no PC, a sessão aparece aqui automaticamente!</p></div>`;
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Data</th><th>Jogo</th><th>Duração</th><th>Tipo</th><th>Notas</th><th></th></tr></thead>
      <tbody>
        ${state.sessions.map(s => `
          <tr>
            <td class="tiny-muted">${esc((s.started_at || '').replace('T', ' ').slice(0, 16))}</td>
            <td><strong>${esc(s.game_title)}</strong></td>
            <td><strong>${Math.round(s.duration_minutes)} min</strong> (${(s.duration_minutes / 60).toFixed(1)}h)</td>
            <td>${s.auto_detected ? '<span class="pill pill-green">🤖 Auto PC</span>' : '<span class="pill">✍️ Manual</span>'}</td>
            <td class="tiny-muted">${esc(s.notes || '')}</td>
            <td><button class="icon-btn" onclick="deleteSession(${s.id})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function saveManualSession() {
  const sel = document.getElementById('sess-game');
  const gid = Number(sel.value) || null;
  const title = sel.options[sel.selectedIndex]?.dataset.title || '';
  if (!title) return toast('Adicione um jogo ao Backlog primeiro!', 'err');
  await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      game_id: gid,
      game_title: title,
      duration_minutes: Number(document.getElementById('sess-mins').value) || 60,
      fun_rating: Number(document.getElementById('sess-fun').value),
      beat_status: document.getElementById('sess-beat').value,
      notes: document.getElementById('sess-notes').value,
    }),
  });
  document.getElementById('sess-notes').value = '';
  toast('⏱️ Sessão salva e horas somadas no Backlog!');
  loadSessions();
  loadGames();
}

async function deleteSession(id) {
  await api(`/api/sessions/${id}`, { method: 'DELETE' });
  loadSessions();
}

// -------------------- SETTINGS & STEAM IMPORT --------------------
async function loadSettings() {
  const [s, sysInfo] = await Promise.all([api('/api/settings'), api('/api/system/info').catch(() => ({}))]);
  state.settings = s;
  document.getElementById('cfg-win-startup').checked = Boolean(sysInfo.windows_startup);
  document.getElementById('cfg-data-path').textContent = sysInfo.data_dir ? `Salvo em: ${sysInfo.data_dir}` : '';
  document.getElementById('cfg-auto-track').checked = s.auto_track_enabled === '1';
  document.getElementById('cfg-auto-add').checked = s.auto_add_detected === '1';
  document.getElementById('cfg-min-sec').value = s.auto_track_min_seconds || 60;
  document.getElementById('cfg-scan-dirs').value = s.custom_scan_dirs || '';
  document.getElementById('cfg-meta').value = s.meta_anual || 20;
  document.getElementById('cfg-hsem').value = s.horas_semana || 12;
  document.getElementById('cfg-hltb-mode').value = s.hltb_mode || 'extra';
  document.getElementById('cfg-gp-price').value = s.gamepass_monthly_price || 35.99;
  document.getElementById('cfg-usd').value = s.usd_to_brl || 5.8;
  document.getElementById('cfg-steam-key').value = s.steam_api_key || '';
  document.getElementById('cfg-steam-id').value = s.steam_id || '';
  document.getElementById('cfg-itad-key').value = s.itad_api_key || '';
}

async function toggleWindowsStartup(enabled) {
  try {
    const res = await api('/api/system/startup', { method: 'POST', body: JSON.stringify({ enabled }) });
    toast(res.windows_startup ? '⚡ Ativado! O app iniciará minimizado na bandeja com o Windows.' : 'Inicialização automática com o Windows desativada.');
  } catch (e) { toast(e.message, 'err'); }
}

async function openDataFolder() {
  await api('/api/system/open-data-dir', { method: 'POST' });
}

async function saveAllSettings() {
  await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({
      auto_track_enabled: document.getElementById('cfg-auto-track').checked ? '1' : '0',
      auto_add_detected: document.getElementById('cfg-auto-add').checked ? '1' : '0',
      auto_track_min_seconds: document.getElementById('cfg-min-sec').value,
      custom_scan_dirs: document.getElementById('cfg-scan-dirs').value,
      meta_anual: document.getElementById('cfg-meta').value,
      horas_semana: document.getElementById('cfg-hsem').value,
      hltb_mode: document.getElementById('cfg-hltb-mode').value,
      gamepass_monthly_price: document.getElementById('cfg-gp-price').value,
      usd_to_brl: document.getElementById('cfg-usd').value,
      steam_api_key: document.getElementById('cfg-steam-key').value.trim(),
      steam_id: document.getElementById('cfg-steam-id').value.trim(),
      itad_api_key: document.getElementById('cfg-itad-key').value.trim(),
    }),
  });
  toast('⚙️ Configurações salvas com sucesso!');
  pollLiveTracker();
}

async function importSteamLibrary() {
  await saveAllSettings();
  const btn = document.getElementById('btn-imp-steam-lib');
  btn.disabled = true; btn.textContent = '⏳ Importando Steam...';
  try {
    const res = await api('/api/steam/import-library', { method: 'POST' });
    toast(`✅ Steam importada! ${res.added} novos jogos adicionados (${res.total_steam} no total).`);
    loadGames();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '📥 Importar Biblioteca Steam';
}

async function syncSteamStats() {
  await saveAllSettings();
  const btn = document.getElementById('btn-sync-steam-stats');
  btn.disabled = true; btn.textContent = '⏳ Sincronizando...';
  try {
    const res = await api('/api/steam/sync-stats', { method: 'POST' });
    toast(`🔄 ${res.updated} jogo(s) atualizados com horas e conquistas da Steam!`);
    loadGames();
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '🔄 Sync Horas & Conquistas';
}

// -------------------- ADD MODAL (UNIFIED SEARCH) --------------------
function openAddModal(dest = 'backlog') {
  state.addDefaultDest = dest;
  document.getElementById('add-modal').classList.add('open');
  document.getElementById('add-query').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
}

async function runUnifiedSearch() {
  const q = document.getElementById('add-query').value.trim();
  if (q.length < 2) return;
  const btn = document.getElementById('btn-add-search');
  btn.disabled = true; btn.textContent = '⏳ Buscando...';
  try {
    const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
    renderSearchPreview(res.best);
    const suggEl = document.getElementById('add-suggestions');
    suggEl.innerHTML = (res.suggestions || []).slice(0, 6).map(s => `
      <button class="sugg-chip" onclick="selectSuggestion('${esc(s.title).replace(/'/g,"\\'")}', ${s.steam_appid})">${esc(s.title)}</button>
    `).join('');
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = '🔍 Buscar';
}

async function selectSuggestion(title, appid) {
  toast(`Carregando detalhes de "${title}"...`);
  const g = await api(`/api/search/lookup?title=${encodeURIComponent(title)}&steam_appid=${appid}`);
  renderSearchPreview(g);
}

function renderSearchPreview(g) {
  state.currentSearchGame = g;
  document.getElementById('add-preview').style.display = 'flex';
  document.getElementById('ap-cover').src = g.cover_url || g.banner_url || '';
  document.getElementById('ap-title').textContent = g.title;

  const pills = [];
  if (g.hltb_main) pills.push(`<span class="pill pill-cyan">⏱️ Main ${g.hltb_main}h</span>`);
  if (g.hltb_extra) pills.push(`<span class="pill pill-indigo">➕ Extra ${g.hltb_extra}h</span>`);
  if (g.hltb_comp) pills.push(`<span class="pill pill-amber">🏆 100% ${g.hltb_comp}h</span>`);
  if (g.critic_score) pills.push(`<span class="pill pill-green">⭐ Crítica ${g.critic_score}</span>`);
  if (g.current_price !== null && g.current_price !== undefined) pills.push(`<span class="pill">💰 ${fmtMoney(g.current_price)} (${esc(g.best_store || 'Loja')})</span>`);
  if (g.historical_low !== null && g.historical_low !== undefined) pills.push(`<span class="pill pill-amber">🔥 Menor ${fmtMoney(g.historical_low)}</span>`);
  if (g.protondb_tier) pills.push(`<span class="pill">🐧 ${esc(g.protondb_tier)}</span>`);
  if (g.gamepass_status && g.gamepass_status !== 'Não') pills.push(`<span class="pill pill-green">${esc(g.gamepass_status)}</span>`);
  document.getElementById('ap-pills').innerHTML = pills.join('');

  if (g.gamepass_status && g.gamepass_status.includes('No PC Game Pass')) {
    document.getElementById('ap-store').value = 'PC Game Pass';
    document.getElementById('ap-price').value = 0;
  } else {
    document.getElementById('ap-price').value = g.current_price ?? 0;
  }
}

async function confirmAddGame(dest) {
  const g = state.currentSearchGame;
  if (!g) return;
  const priceVal = Number(document.getElementById('ap-price').value) || 0;

  if (dest === 'backlog') {
    await api('/api/games', {
      method: 'POST',
      body: JSON.stringify({
        title: g.title,
        status: document.getElementById('ap-status').value,
        priority: Number(document.getElementById('ap-prio').value),
        store: document.getElementById('ap-store').value,
        genre: g.genre || '',
        release_year: g.release_year,
        hltb_main: g.hltb_main,
        hltb_extra: g.hltb_extra,
        hltb_comp: g.hltb_comp,
        hltb_url: g.hltb_url || '',
        critic_score: g.critic_score,
        price_paid: priceVal,
        protondb_tier: g.protondb_tier || '',
        steam_appid: g.steam_appid,
        cover_url: g.cover_url || '',
        banner_url: g.banner_url || '',
      }),
    });
    toast(`✅ "${g.title}" adicionado ao Backlog!`);
    closeAddModal();
    loadGames();
    loadDashboard();
  } else {
    await api('/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({
        title: g.title,
        hltb_est: g.hltb_extra || g.hltb_main,
        critic_score: g.critic_score,
        full_price: g.full_price,
        current_price: g.current_price,
        historical_low: g.historical_low,
        target_price: priceVal || (g.full_price ? Math.round(g.full_price * 0.5) : null),
        best_store: g.best_store || 'Steam',
        gamepass_status: g.gamepass_status || 'Não',
        steam_appid: g.steam_appid,
        deal_url: g.deal_url || '',
        cover_url: g.banner_url || g.cover_url || '',
      }),
    });
    toast(`🏷️ "${g.title}" salvo na Wishlist!`);
    closeAddModal();
    loadWishlist();
    loadDashboard();
  }
}

// Keyboard shortcut Ctrl+K to open search modal
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openAddModal();
  }
  if (e.key === 'Escape') {
    closeAddModal();
    closeDrawer();
  }
});

// -------------------- INIT --------------------
async function initApp() {
  await Promise.all([loadDashboard(), loadGames(), pollLiveTracker()]);
  setInterval(pollLiveTracker, 3000);
}
initApp();
