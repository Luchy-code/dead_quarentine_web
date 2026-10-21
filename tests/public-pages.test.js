import { describe, expect, it, vi } from 'vitest';
import {
  createPage,
  executeInlineScript,
  readProjectFile
} from './helpers.js';

describe('static page HTML and CSS', () => {
  it.each(['index.html', 'ranking.html', 'logros_globales.html'])(
    '%s has a complete document shell and its core styling',
    async (fileName) => {
      const html = await readProjectFile('public', fileName);
      const dom = await createPage(fileName);
      const { document } = dom.window;

      expect(html.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
      expect(document.documentElement).toBeTruthy();
      expect(document.head).toBeTruthy();
      expect(document.body).toBeTruthy();
      expect(document.querySelector('meta[name="viewport"]')).toBeTruthy();
      expect(document.querySelector('main')).toBeTruthy();
      expect(document.querySelector('style')?.textContent).toContain('::-webkit-scrollbar');
      expect(html).toContain('darkMode: "class"');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      dom.window.close();
    }
  );

  it('dashboard exposes the ranking, achievements, and filter controls', async () => {
    const dom = await createPage('index.html');
    const { document } = dom.window;

    for (const id of [
      'nav-ranking',
      'nav-logros',
      'vista-ranking',
      'vista-logros',
      'rank-search',
      'rank-mode',
      'podium-container',
      'ranking-tbody',
      'ranking-page-size',
      'ranking-page-summary',
      'ranking-page-number',
      'ranking-page-prev',
      'ranking-page-next',
      'logros-container'
    ]) {
      expect(document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
    expect(document.getElementById('rank-vpn')).toBeNull();
    expect(document.querySelector('#vista-ranking thead').textContent).not.toMatch(/TELEMETRÍA IP|VPN/i);
    expect(document.querySelector('#vista-ranking thead').textContent).toContain('DIFICULTAD');
    expect(document.querySelector('html').getAttribute('lang')).toBe('es');

    dom.window.close();
  });

  it('ranking page contains usable filters without showing IP or VPN telemetry', async () => {
    const dom = await createPage('ranking.html');
    const { document } = dom.window;

    expect(document.getElementById('filter-search')?.type).toBe('text');
    expect(document.getElementById('filter-country')).toBeNull();
    expect(document.getElementById('filter-difficulty')?.tagName).toBe('SELECT');
    expect(document.getElementById('filter-vpn')).toBeNull();
    expect(document.getElementById('reset-filters')?.tagName).toBe('BUTTON');
    expect(document.querySelector('thead').textContent).not.toMatch(/VPN|TELEMETRÍA IP/i);
    expect(document.body.textContent).not.toMatch(/SOLO SIN VPN/i);
    expect(document.querySelectorAll('#ranking-table-body tr')).toHaveLength(1);
    expect(document.querySelector('#ranking-table-body').textContent)
      .toContain('Cargando puntajes desde la base de datos');
    expect(document.querySelector('#ranking-table-body').textContent)
      .not.toContain('Kronos_ES');

    dom.window.close();
  });

  it('loads ranking rows and mode/difficulty filters from the ranking API', async () => {
    const dom = await createPage('ranking.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [{
          puesto: 1,
          username: 'Jugador DB',
          puntos: 900,
          modo: 'multiplayer',
          dificultad: 'pesadilla',
          creado_en: '2026-10-17T10:00:00.000Z'
        }],
        top: [{
          username: 'Jugador DB',
          puntos: 900,
          modo: 'multiplayer',
          dificultad: 'pesadilla'
        }],
        total: 1,
        page: 1,
        limit: 10,
        modos: ['multiplayer'],
        dificultades: ['pesadilla']
      })
    });
    executeInlineScript(dom, (script) => script.includes("url.searchParams.set('view', 'table')"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestUrl = new URL(window.fetch.mock.calls[0][0]);
    expect(requestUrl.pathname).toBe('/api/ranking');
    expect(requestUrl.searchParams.get('view')).toBe('table');
    expect(window.document.querySelector('#ranking-table-body').textContent).toContain('Jugador DB');
    expect(window.document.querySelector('#ranking-table-body').textContent).toContain('pesadilla');
    expect(window.document.querySelector('#ranking-table-body').textContent).not.toMatch(/VPN|TELEMETRÍA IP/i);
    expect(window.document.querySelector('#ranking-podium').textContent).toContain('multiplayer');
    expect(window.document.querySelector('#ranking-podium').textContent).not.toMatch(/VPN|TELEMETRÍA IP/i);
    expect(window.document.querySelector('#filter-mode').textContent).toContain('multiplayer');
    expect(window.document.querySelector('#filter-difficulty').textContent).toContain('pesadilla');
    expect(window.document.querySelector('#ranking-summary').textContent).toContain('DE 1 REGISTROS');

    dom.window.close();
  });

  it('achievement matrix contains category/search and expand/collapse controls', async () => {
    const dom = await createPage('logros_globales.html');
    const { document } = dom.window;

    expect(document.getElementById('matrix-search')?.type).toBe('text');
    expect(document.getElementById('expand-all-btn')).toBeTruthy();
    expect(document.getElementById('collapse-all-btn')).toBeTruthy();
    expect(document.querySelectorAll('.cat-pill').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('.achievement-card').length).toBeGreaterThan(0);

    dom.window.close();
  });
});

describe('dashboard inline JavaScript', () => {
  async function loadDashboard(view = '') {
    const url = view
      ? `https://dead-quarantine.test/index.html?view=${view}`
      : 'https://dead-quarantine.test/index.html';
    const dom = await createPage('index.html', url);
    const { window } = dom;
    window.tailwind = {};
    window.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ rows: [], top: [], total: 0, page: 1, limit: 100 })
    });
    window.console.error = vi.fn();
    executeInlineScript(dom, (script) => script.includes('function mostrarPestaña'));
    return dom;
  }

  it('switches between ranking and achievement tabs', async () => {
    const dom = await loadDashboard();
    const { window } = dom;

    window.mostrarPestaña('logros');
    expect(window.document.getElementById('vista-ranking').classList.contains('hidden')).toBe(true);
    expect(window.document.getElementById('vista-logros').classList.contains('hidden')).toBe(false);

    window.mostrarPestaña('ranking');
    expect(window.document.getElementById('vista-ranking').classList.contains('hidden')).toBe(false);
    expect(window.document.getElementById('vista-logros').classList.contains('hidden')).toBe(true);

    dom.window.close();
  });

  it('loads ranking rows, top-three podium, and the complete table', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    const rows = Array.from({ length: 4 }, (_, index) => ({
      username: `Player${index + 1}`,
      puntos: 1000 - index,
      modo: 'Singleplayer',
      dificultad: 'Normal',
      pais: 'Argentina',
      codigo_pais: 'AR',
      usa_vpn: 0,
      creado_en: '2026-01-01T00:00:00.000Z'
    }));
    window.fetch.mockResolvedValueOnce({
      json: async () => ({
        rows,
        top: rows.slice(0, 3),
        total: 4,
        page: 1,
        limit: 100
      })
    });

    await window.cargarRanking();

    expect(window.fetch).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/api/ranking'
    }), { cache: 'no-store' });
    const requestUrl = new URL(window.fetch.mock.calls.at(-1)[0]);
    expect(requestUrl.searchParams.get('view')).toBe('table');
    expect(requestUrl.searchParams.get('limit')).toBe('100');
    expect(window.document.querySelectorAll('#podium-container > div')).toHaveLength(3);
    expect(window.document.querySelectorAll('#ranking-tbody tr')).toHaveLength(4);
    expect(window.document.querySelector('#ranking-tbody').textContent).toContain('Player4');
    expect(window.document.querySelector('#ranking-tbody').textContent).toContain('Normal');
    expect(window.document.querySelector('#podium-container').textContent).toContain('Normal');

    dom.window.close();
  });

  it('loads later website pages without changing the game top-five endpoint', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    window.fetch = vi.fn(async (requestUrl) => {
      const requestedPage = Number(new URL(requestUrl).searchParams.get('page'));
      const row = {
        puesto: requestedPage === 1 ? 1 : 101,
        username: `Player${requestedPage}`,
        puntos: 1000,
        modo: 'Singleplayer',
        dificultad: 'Normal',
        pais: 'Argentina',
        codigo_pais: 'AR',
        creado_en: '2026-01-01T00:00:00.000Z'
      };
      return {
        ok: true,
        json: async () => ({
          rows: [row],
          top: [{ ...row, puesto: 1 }],
          total: 101,
          page: requestedPage,
          limit: 100
        })
      };
    });

    await window.cargarRanking();
    expect(window.document.getElementById('ranking-page-next').disabled).toBe(false);
    window.document.getElementById('ranking-page-next').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestedPages = window.fetch.mock.calls.map(([url]) =>
      new URL(url).searchParams.get('page')
    );
    expect(requestedPages).toContain('1');
    expect(requestedPages).toContain('2');
    expect(window.document.querySelector('#ranking-tbody').textContent).toContain('#101');
    expect(window.document.getElementById('ranking-page-number').textContent).toContain('2 / 2');

    dom.window.close();
  });

  it('shows an error when the ranking API returns users without scores', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    window.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, username: 'Player1', creado_en: '2026-01-01T00:00:00.000Z' }]
    });

    await window.cargarRanking();

    expect(window.document.querySelector('#ranking-tbody').textContent)
      .toContain('Verifica que la API devuelva puntajes');
    expect(window.document.querySelectorAll('#podium-container > div')).toHaveLength(0);
    expect(window.console.error).toHaveBeenCalledOnce();

    dom.window.close();
  });

  it('passes only active ranking filters to the API', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    window.document.getElementById('rank-search').value = 'Alice';
    window.document.getElementById('rank-mode').value = 'Multiplayer';

    await window.cargarRanking();

    const requestUrl = new URL(window.fetch.mock.calls[0][0]);
    expect(window.fetch.mock.calls[0][1]).toEqual({ cache: 'no-store' });
    expect(requestUrl.pathname).toBe('/api/ranking');
    expect(requestUrl.searchParams.get('search')).toBe('Alice');
    expect(requestUrl.searchParams.has('country')).toBe(false);
    expect(requestUrl.searchParams.get('mode')).toBe('Multiplayer');
    expect(requestUrl.searchParams.get('view')).toBe('table');
    expect(requestUrl.searchParams.get('page')).toBe('1');
    expect(requestUrl.searchParams.get('limit')).toBe('100');
    expect(requestUrl.searchParams.has('vpnOnly')).toBe(false);

    dom.window.close();
  });

  it('loads achievements and displays their sub-achievements and progress', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    window.fetch.mockResolvedValueOnce({
      json: async () => ({
        total_usuarios: 4,
        logros: [{
          categoria: 'Combate',
          modo: 'Singleplayer',
          clave: 'first_blood',
          titulo: 'Primera sangre',
          descripcion: 'Derrota a un enemigo',
          sublogros_requeridos: 1,
          porcentaje_global: 25,
          completados_global: 1,
          sublogros: [{
            orden: 1,
            titulo: 'Primer enemigo',
            clave: 'enemy_one',
            porcentaje_global: 25,
            completados_global: 1
          }]
        }]
      })
    });

    await window.cargarLogros();

    expect(window.fetch).toHaveBeenCalledWith('/api/logros/globales');
    expect(window.document.querySelector('.achievement-card')?.textContent).toContain('Primera sangre');
    expect(window.document.querySelector('.achievement-card')?.textContent).toContain('Primer enemigo');
    expect(window.document.querySelector('.achievement-card')?.textContent).toContain('25% GLOBAL');

    dom.window.close();
  });

  it('toggles a card and expands or collapses all achievement cards', async () => {
    const dom = await loadDashboard();
    const { window } = dom;
    window.document.getElementById('logros-container').innerHTML = `
      <div class="achievement-card">
        <div class="sub-matrix hidden"></div><span class="chevron"></span>
      </div>
      <div class="achievement-card">
        <div class="sub-matrix hidden"></div><span class="chevron"></span>
      </div>`;
    const firstCard = window.document.querySelector('.achievement-card');
    const trigger = window.document.createElement('button');
    firstCard.prepend(trigger);

    window.alternarTarjeta(trigger);
    expect(firstCard.querySelector('.sub-matrix').classList.contains('hidden')).toBe(false);
    expect(firstCard.querySelector('.chevron').classList.contains('rotate-180')).toBe(true);

    window.alternarTodos(true);
    expect([...window.document.querySelectorAll('.sub-matrix')].every((el) => !el.classList.contains('hidden'))).toBe(true);
    window.alternarTodos(false);
    expect([...window.document.querySelectorAll('.sub-matrix')].every((el) => el.classList.contains('hidden'))).toBe(true);

    dom.window.close();
  });

  it('reports API failures without breaking the dashboard', async () => {
    const dom = await loadDashboard();
    dom.window.fetch.mockRejectedValueOnce(new Error('offline'));

    await dom.window.cargarRanking();

    expect(dom.window.console.error).toHaveBeenCalledOnce();
    dom.window.close();
  });
});

describe('static ranking inline JavaScript', () => {
  function rankingResponse() {
    return {
      ok: true,
      json: async () => ({
        rows: [{
          puesto: 1,
          username: 'Luna',
          puntos: 100,
          modo: 'multiplayer',
          dificultad: 'pesadilla',
          creado_en: '2026-10-17T10:00:00.000Z'
        }],
        top: [],
        total: 1,
        page: 1,
        limit: 10,
        modos: ['multiplayer'],
        dificultades: ['pesadilla']
      })
    };
  }

  it('queries filtered ranking values and reloads after reset', async () => {
    const dom = await createPage('ranking.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue(rankingResponse());
    executeInlineScript(dom, (script) => script.includes("url.searchParams.set('view', 'table')"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const search = window.document.getElementById('filter-search');
    const mode = window.document.getElementById('filter-mode');
    const difficulty = window.document.getElementById('filter-difficulty');
    const reset = window.document.getElementById('reset-filters');

    mode.value = 'multiplayer';
    difficulty.value = 'pesadilla';
    mode.dispatchEvent(new window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestUrl = new URL(window.fetch.mock.calls.at(-1)[0]);
    expect(requestUrl.searchParams.has('country')).toBe(false);
    expect(requestUrl.searchParams.get('mode')).toBe('multiplayer');
    expect(requestUrl.searchParams.get('dificultad')).toBe('pesadilla');
    expect(requestUrl.searchParams.has('vpnOnly')).toBe(false);
    expect(window.document.querySelector('#ranking-table-body').textContent).toContain('Luna');

    reset.click();
    expect(search.value).toBe('');
    expect(mode.value).toBe('ALL');
    expect(difficulty.value).toBe('ALL');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(new URL(window.fetch.mock.calls.at(-1)[0]).searchParams.has('country')).toBe(false);

    dom.window.close();
  });

  it('focuses and selects the search field for Ctrl+K and Meta+K', async () => {
    const dom = await createPage('ranking.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue(rankingResponse());
    executeInlineScript(dom, (script) => script.includes("url.searchParams.set('view', 'table')"));
    const search = window.document.getElementById('filter-search');
    const selectSpy = vi.spyOn(search, 'select');

    for (const modifier of ['ctrlKey', 'metaKey']) {
      const event = new window.KeyboardEvent('keydown', {
        key: 'k',
        [modifier]: true,
        cancelable: true
      });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(window.document.activeElement).toBe(search);
    }
    expect(selectSpy).toHaveBeenCalledTimes(2);

    dom.window.close();
  });
});

describe('achievement matrix inline JavaScript', () => {
  it('toggles individual cards and expands/collapses all cards', async () => {
    const dom = await createPage('logros_globales.html');
    const { window } = dom;
    executeInlineScript(dom, (script) => script.includes('function initMatrix'));
    const cards = [...window.document.querySelectorAll('.achievement-card')];
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    const firstPanel = firstCard.querySelector('.sub-matrix');
    firstCard.querySelector('.toggle-panel').click();
    expect(firstPanel.classList.contains('hidden')).toBe(true);

    window.document.getElementById('expand-all-btn').click();
    expect(cards.every((card) => !card.querySelector('.sub-matrix').classList.contains('hidden'))).toBe(true);
    window.document.getElementById('collapse-all-btn').click();
    expect(cards.every((card) => card.querySelector('.sub-matrix').classList.contains('hidden'))).toBe(true);

    dom.window.close();
  });

  it('filters achievement cards by category and by text search', async () => {
    const dom = await createPage('logros_globales.html');
    const { window } = dom;
    Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent;
      }
    });
    executeInlineScript(dom, (script) => script.includes('function initMatrix'));
    const cards = [...window.document.querySelectorAll('.achievement-card')];
    const categories = [...new Set(cards.map((card) => card.getAttribute('data-category')))];
    expect(categories.length).toBeGreaterThan(1);

    const categoryPill = [...window.document.querySelectorAll('.cat-pill')]
      .find((pill) => pill.getAttribute('data-cat') === categories[0]);
    categoryPill.click();
    expect(cards.filter((card) => !card.classList.contains('hidden'))
      .every((card) => card.getAttribute('data-category') === categories[0])).toBe(true);

    const search = window.document.getElementById('matrix-search');
    search.value = 'term-that-does-not-exist';
    search.dispatchEvent(new window.Event('input'));
    expect(cards.every((card) => card.classList.contains('hidden'))).toBe(true);

    dom.window.close();
  });
});
