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
