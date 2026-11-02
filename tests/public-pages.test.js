import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createPage,
  executeInlineScript,
  readProjectFile
} from './helpers.js';

describe('static page HTML and CSS', () => {
  it('uses GLB models whose neck attachments are not bound to incomplete skins', async () => {
    const modelFiles = [
      'SM_Chr_Bombsuit_Male_01.glb',
      'SM_Chr_Contractor_Male_01.glb',
      'SM_Chr_Soldier_Male_01.glb',
      'SM_Chr_Contractor_Female_01.glb',
      'SM_Chr_Soldier_Female_01.glb'
    ];

    for (const fileName of modelFiles) {
      const model = await readFile(join(process.cwd(), 'public', 'gib3', fileName));
      expect(model.toString('ascii', 0, 4), fileName).toBe('glTF');
      expect(model.readUInt32LE(4), fileName).toBe(2);

      const jsonLength = model.readUInt32LE(12);
      const gltf = JSON.parse(model.toString('utf8', 20, 20 + jsonLength));
      const meshesWithUnweightedJoints = gltf.meshes
        .map((mesh, index) => [
          index,
          mesh.primitives.some((primitive) =>
            Object.hasOwn(primitive.attributes, 'JOINTS_0') &&
            !Object.hasOwn(primitive.attributes, 'WEIGHTS_0')
          )
        ])
        .filter(([, hasUnweightedJoints]) => hasUnweightedJoints)
        .map(([index]) => index);
      const skinnedInvalidMeshes = gltf.nodes.filter(
        (node) => meshesWithUnweightedJoints.includes(node.mesh) && Object.hasOwn(node, 'skin')
      );

      expect(skinnedInvalidMeshes, fileName).toHaveLength(0);
    }
  });

  it.each(['index.html', 'ranking.html', 'logros_globales.html', 'telemetria.html'])(
    '%s has consistent navigation with a home-linked logo',
    async (fileName) => {
      const dom = await createPage(fileName);
      const { document } = dom.window;
      const desktopNav = document.querySelector('nav[aria-label="Navegación principal"]');

      expect(document.querySelector('a[aria-label="Ir al inicio"]')?.getAttribute('href'))
        .toBe('/index.html');
      expect(document.querySelector('a[aria-label="Ir al inicio"] img')?.getAttribute('src'))
        .toBe('/img/logo2.0.jpeg');
      expect(document.querySelector('link[rel="icon"]')?.getAttribute('href'))
        .toBe('/img/logo2.0.jpeg');

      for (const [path, href] of [
        ['historia-y-supervivientes', '/index.html#historia-y-supervivientes'],
        ['top-global-ranking', '/ranking.html'],
        ['matriz-de-logros', '/logros_globales.html']
      ]) {
        const link = desktopNav.querySelector(`[data-path="${path}"]`);
        expect(link?.getAttribute('href')).toBe(href);
        expect(link?.classList.contains('whitespace-nowrap')).toBe(true);
        expect(link?.classList.contains('text-center')).toBe(true);
      }

      expect(desktopNav.classList.contains('justify-center')).toBe(true);
      const activeLink = desktopNav.querySelector('[aria-current="page"]');
      if (fileName === 'telemetria.html') {
        expect(activeLink).toBeNull();
      } else {
        expect(activeLink?.classList.contains('bg-primary-container')).toBe(true);
      }
      const mobileNav = document.querySelector('nav[aria-label="Navegación principal móvil"]');
      expect(mobileNav).toBeTruthy();
      expect(mobileNav.querySelector('a[href="/index.html#historia-y-supervivientes"]')).toBeTruthy();
      expect(mobileNav.querySelector('a[href="/ranking.html"]')).toBeTruthy();
      expect(mobileNav.querySelector('a[href="/logros_globales.html"]')).toBeTruthy();
      expect(mobileNav.querySelectorAll('a.whitespace-nowrap')).toHaveLength(3);
      if (fileName === 'logros_globales.html') {
        const mobileActiveLink = mobileNav.querySelector('[aria-current="page"]');
        expect(activeLink?.dataset.path).toBe('matriz-de-logros');
        expect(mobileActiveLink?.dataset.path).toBe('matriz-de-logros');
        expect(mobileActiveLink?.classList.contains('bg-primary-container')).toBe(true);
      }

      dom.window.close();
    }
  );

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

  it('homepage introduces Sector 07 and links to the ranking and achievements', async () => {
    const dom = await createPage('index.html');
    const { document } = dom.window;

    expect(document.documentElement.getAttribute('lang')).toBe('es');
    expect(document.title).toBe('Dead Quarantine II - Sector 07');
    expect(document.body.textContent).toContain('LOS SUPERVIVIENTES');
    expect(document.querySelector('script[src*="model-viewer/3.4.0/model-viewer.min.js"]'))
      .toBeTruthy();
    expect(document.querySelector('#knox-model')?.getAttribute('src'))
      .toBe('/gib3/SM_Chr_Bombsuit_Male_01.glb');
    expect(document.querySelector('#knox-model')?.hasAttribute('camera-controls')).toBe(true);
    expect(document.querySelector('#knox-model')?.hasAttribute('disable-zoom')).toBe(true);
    expect([...document.querySelectorAll('main model-viewer')].map((model) => [
      model.id,
      model.getAttribute('src')
    ])).toEqual([
      ['knox-model', '/gib3/SM_Chr_Bombsuit_Male_01.glb'],
      ['ryder-model', '/gib3/SM_Chr_Contractor_Male_01.glb'],
      ['oscar-model', '/gib3/SM_Chr_Soldier_Male_01.glb'],
      ['vega-model', '/gib3/SM_Chr_Contractor_Female_01.glb'],
      ['janet-model', '/gib3/SM_Chr_Soldier_Female_01.glb']
    ]);
    expect(document.querySelectorAll('main model-viewer')).toHaveLength(5);
    expect(document.querySelectorAll('model-viewer[data-model-loader]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-model-loading][role="status"]')).toHaveLength(5);
    const survivorSection = document.querySelectorAll('main section')[2];
    expect([...survivorSection.querySelectorAll('h3')].map((heading) => heading.textContent.trim()))
      .toEqual(['KNOX', 'RYDER', 'OSCAR', 'VEGA', 'JANET']);
    const profiles = [...survivorSection.querySelectorAll('[data-character-profile]')];
    expect(profiles).toHaveLength(5);
    expect(profiles.map((profile) => profile.textContent.trim())).toEqual([
      expect.stringContaining('traje EOD'),
      expect.stringContaining('localizar suministros'),
      expect.stringContaining('control estable del rifle'),
      expect.stringContaining('rastrea biomasa'),
      expect.stringContaining('escuadrón coordinado')
    ]);
    const characters = [...survivorSection.querySelectorAll('[data-game-character]')];
    expect(characters.map((card) =>
      card.querySelector('.bg-surface-container-high span')?.textContent.trim()
    )).toEqual([
      'ROL: TANQUE',
      'ROL: EXPLORADOR',
      'ROL: SOLDADO',
      'ROL: EXPLORADOR',
      'ROL: SOLDADO'
    ]);
    expect(characters.map((card) =>
      [...card.querySelector('[data-game-stats]').querySelectorAll('span')]
        .map((stat) => stat.textContent.trim())
    )).toEqual([
      ['VIDA', '200', 'VELOCIDAD (%)', '-30%', 'ESTAMINA', '80', 'REGEN. ESTAMINA (%)', '-10%', 'VELOCIDAD RECARGA (%)', '+20%'],
      ['VIDA', '80', 'VELOCIDAD (%)', '+15%', 'ESTAMINA', '120', 'REGEN. ESTAMINA (%)', '+25%', 'VELOCIDAD RECARGA (%)', '-10%'],
      ['VIDA', '100', 'VELOCIDAD (%)', '0%', 'ESTAMINA', '100', 'REGEN. ESTAMINA (%)', '0%', 'VELOCIDAD RECARGA (%)', '0%'],
      ['VIDA', '80', 'VELOCIDAD (%)', '+15%', 'ESTAMINA', '120', 'REGEN. ESTAMINA (%)', '+25%', 'VELOCIDAD RECARGA (%)', '-10%'],
      ['VIDA', '100', 'VELOCIDAD (%)', '0%', 'ESTAMINA', '100', 'REGEN. ESTAMINA (%)', '0%', 'VELOCIDAD RECARGA (%)', '0%']
    ]);
    expect(survivorSection.textContent).not.toMatch(/TIER|BLINDAJE CORPORAL|POTENCIA DE FUEGO|EFICIENCIA DE SUMINISTROS|PRECISIÓN Y PUNTERÍA|CONTROL DE RETROCESO|DETECCIÓN DE AMENAZAS|SIGILO OPERATIVO|COORDINACIÓN DE ESCUADRÓN/);
    expect(survivorSection.querySelectorAll('[data-inspect-character]')).toHaveLength(5);
    expect(document.querySelector('[role="dialog"][aria-modal="true"]#character-inspection'))
      .toBeTruthy();
    expect(document.querySelector('img[alt^="Knox Pose"]')).toBeNull();
    expect(document.querySelector('[data-path="top-global-ranking"]')?.getAttribute('href'))
      .toBe('/ranking.html');
    expect(document.querySelector('[data-path="matriz-de-logros"]')?.getAttribute('href'))
      .toBe('/logros_globales.html');
    expect(document.querySelector('[data-path="historia-y-supervivientes"]')?.getAttribute('href'))
      .toBe('/index.html#historia-y-supervivientes');
    const mutantSection = [...document.querySelectorAll('main section')]
      .find((section) => section.textContent.includes('EXPEDIENTE: COMANDO MUTANTE'));
    expect(mutantSection.querySelector('h2')?.textContent.trim())
      .toBe('EXPEDIENTE: COMANDO MUTANTE');
    expect(mutantSection.querySelector('h3')).toBeNull();
    expect(mutantSection.textContent).not.toContain('REGISTRO FOTOGRÁFICO');
    expect(mutantSection.querySelectorAll('ul[aria-label="Puntos tácticos del comando mutante"] strong'))
      .toHaveLength(4);
    for (const threat of ['Cánido', 'Bruto Militar', 'Miss Amazing', 'Mutación Gestante']) {
      expect(mutantSection.querySelector('ul').textContent).toContain(threat);
    }
    expect(mutantSection.textContent).toContain('AMENAZA: APOCALÍPTICA');
    expect(mutantSection.textContent).toContain('JEFE ACTIVO');
    expect(mutantSection.querySelector('.bg-surface-container-low > div span')?.textContent.trim())
      .toBe('Estrategia');
    expect(mutantSection.textContent).toContain('Clasificación');
    expect(mutantSection.querySelector('img[alt="Comando de Jefes Mutantes"]')?.getAttribute('src'))
      .toBe('/img/jefes.jpg');
    expect(document.querySelector('[data-path="expediente-y-jugadores"]')).toBeNull();
    expect(document.querySelectorAll('a[href="/ranking.html"]')).toHaveLength(4);
    expect(document.querySelectorAll('a[href="/logros_globales.html"]')).toHaveLength(4);
    expect(document.querySelector('nav[aria-label="Navegación principal móvil"]')).toBeTruthy();
    expect(document.querySelector('#historia-y-supervivientes')).toBeTruthy();
    expect(document.querySelector('main')?.classList.contains('pt-32')).toBe(true);
    expect(document.querySelector('main')?.classList.contains('xl:pt-20')).toBe(true);
    expect(document.body.textContent).not.toContain('BUSCAR EXPEDIENTE');
    expect(document.getElementById('active-users-count')).toBeTruthy();
    expect(document.getElementById('total-users-count')).toBeTruthy();
    expect(document.getElementById('active-users-percent')).toBeTruthy();
    expect(document.getElementById('active-users-ring')).toBeTruthy();
    expect(document.getElementById('inactive-users-count')).toBeTruthy();
    expect(document.body.textContent).not.toContain('ACTIVIDAD RECIENTE');

    dom.window.close();
  });

  it('shows model loading status and reports viewer errors', async () => {
    const dom = await createPage('index.html');
    const { document, Event } = dom.window;
    const viewers = [...document.querySelectorAll('model-viewer[data-model-loader]')];

    expect(viewers).toHaveLength(5);
    for (const viewer of viewers) {
      const container = viewer.closest('[data-model-viewer-container]');
      expect(container?.getAttribute('aria-busy')).toBe('true');
      expect(container?.querySelector('[data-model-loading]')?.textContent)
        .toContain('CARGANDO MODELO 3D...');
    }

    executeInlineScript(dom, (script) => script.includes(
      "document.querySelectorAll('model-viewer[data-model-loader]')"
    ));

    const loadedViewer = viewers[0];
    loadedViewer.dispatchEvent(new Event('load'));
    expect(loadedViewer.closest('[data-model-viewer-container]')?.getAttribute('aria-busy'))
      .toBe('false');
    expect(loadedViewer.parentElement.querySelector('[data-model-loading]')?.classList.contains('hidden'))
      .toBe(true);

    const failedViewer = viewers[1];
    failedViewer.dispatchEvent(new Event('error'));
    const failedStatus = failedViewer.parentElement.querySelector('[data-model-loading]');
    expect(failedStatus.textContent).toContain('NO SE PUDO CARGAR EL MODELO');
    expect(failedStatus.querySelector('[aria-hidden="true"]')?.classList.contains('hidden'))
      .toBe(true);

    dom.window.close();
  });

  it('opens a large interactive character viewer and restores it when inspection closes', async () => {
    const dom = await createPage('index.html');
    const { window } = dom;
    const { document, Event, KeyboardEvent } = window;
    executeInlineScript(dom, (script) => script.includes('const inspectionDialog'));

    const button = document.querySelector('[data-inspect-character]');
    const viewer = button.closest('.group').querySelector('model-viewer');
    const originalContainer = viewer.parentElement;
    const dialog = document.getElementById('character-inspection');
    const closeButton = document.getElementById('character-inspection-close');

    button.click();
    expect(dialog.classList.contains('hidden')).toBe(false);
    expect(dialog.getAttribute('aria-hidden')).toBe('false');
    expect(document.getElementById('character-inspection-name').textContent).toBe('KNOX');
    expect(document.getElementById('character-inspection-role').textContent)
      .toContain('CONTENCIÓN');
    expect(dialog.textContent).not.toContain('PERFIL OPERATIVO');
    expect(dialog.textContent).not.toContain('EQUIPO PRINCIPAL');
    expect(dialog.textContent).not.toContain('ESCOPETA 12G BULLPUP');
    expect(viewer.parentElement).toBe(dialog.querySelector('[data-inspection-viewer-container]'));
    expect(viewer.hasAttribute('disable-zoom')).toBe(false);
    expect(viewer.hasAttribute('camera-controls')).toBe(true);

    viewer.dispatchEvent(new Event('load'));
    expect(dialog.querySelector('[data-inspection-loading]').classList.contains('hidden'))
      .toBe(true);
    expect(dialog.querySelector('[data-inspection-viewer-container]').getAttribute('aria-busy'))
      .toBe('false');

    closeButton.click();
    expect(dialog.classList.contains('hidden')).toBe(true);
    expect(viewer.parentElement).toBe(originalContainer);
    expect(viewer.hasAttribute('disable-zoom')).toBe(true);
    expect(document.activeElement).toBe(button);

    button.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(dialog.classList.contains('hidden')).toBe(true);
    expect(viewer.parentElement).toBe(originalContainer);

    dom.window.close();
  });

  it('loads live user telemetry and refreshes the displayed counts', async () => {
    const dom = await createPage('index.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usuarios_totales: 20,
        usuarios_activos: 3,
        porcentaje_activos: 15
      })
    });
    window.setInterval = vi.fn();
    executeInlineScript(dom, (script) => script.includes("fetch('/api/telemetria'"));

    await window.loadUserTelemetry();

    expect(window.fetch).toHaveBeenCalledWith('/api/telemetria', { cache: 'no-store' });
    expect(window.document.getElementById('total-users-count').textContent).toBe('20');
    expect(window.document.getElementById('active-users-count').textContent).toBe('3');
    expect(window.document.getElementById('active-users-percent').textContent).toBe('15%');
    expect(window.document.getElementById('inactive-users-count').textContent).toBe('17');
    expect(window.document.getElementById('active-users-ring').getAttribute('stroke-dasharray'))
      .toBe('15, 100');
    expect(window.setInterval).toHaveBeenCalledOnce();
    expect(window.setInterval).toHaveBeenCalledWith(window.loadUserTelemetry, 60_000);

    dom.window.close();
  });

  it('dashboard exposes the ranking, achievements, and filter controls', async () => {
    const dom = await createPage('telemetria.html');
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
    expect(document.getElementById('clear-search')?.getAttribute('aria-label'))
      .toBe('Limpiar búsqueda');
    expect(document.getElementById('clear-search')?.textContent).toContain('delete');
    expect(document.querySelector('#filter-search').parentElement.textContent).not.toContain('CTRL+K');
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
    expect(document.getElementById('ranking-total-scores')?.textContent).toBe('CARGANDO...');
    expect(document.getElementById('ranking-best-score')?.textContent).toBe('CARGANDO...');
    expect(document.body.textContent).not.toMatch(
      /DATABASE STREAM|RANKING CONECTADO|BIO-HAZARD|ANTI-CHEAT KERNEL|GEO-LATENCY|MODOS \/ DIFICULTADES/i
    );

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
          puesto: 10,
          username: 'Jugador DB',
          puntos: 900,
          modo: 'multiplayer',
          dificultad: 'pesadilla'
        }],
        total: 1,
        statistics: {
          puntajes_totales: 14,
          mejor_puntaje: 71950
        },
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
    expect(window.document.querySelector('#ranking-podium').textContent).toContain('PUESTO #10');
    expect(window.document.querySelector('#ranking-podium').textContent).not.toContain('ORO');
    expect(window.document.querySelector('#ranking-podium').textContent).not.toMatch(/VPN|TELEMETRÍA IP/i);
    expect(window.document.querySelector('#filter-mode').textContent).toContain('multiplayer');
    expect(window.document.querySelector('#filter-difficulty').textContent).toContain('pesadilla');
    expect(window.document.querySelector('#ranking-summary').textContent).toContain('DE 1 REGISTROS');
    expect(window.document.getElementById('ranking-total-scores').textContent).toBe('14');
    expect(window.document.getElementById('ranking-best-score').textContent).toBe('71.950 PTS');
    expect(window.document.body.textContent).not.toContain('MODOS / DIFICULTADES');

    dom.window.close();
  });

  it('achievement matrix contains category filters without a search input', async () => {
    const dom = await createPage('logros_globales.html');
    const { document } = dom.window;

    expect(document.getElementById('matrix-search')).toBeNull();
    expect(document.getElementById('expand-all-btn')).toBeNull();
    expect(document.getElementById('collapse-all-btn')).toBeNull();
    expect([...document.querySelectorAll('.cat-pill')].map((pill) => pill.textContent.trim()))
      .toEqual(['Todas las Categorías']);
    expect(document.getElementById('category-filters').textContent).not.toMatch(/\[\d+\]/);
    expect(document.getElementById('achievement-total').textContent).toBe('--');
    expect(document.getElementById('registered-users').textContent).toBe('--');
    expect(document.getElementById('achievements-container').textContent)
      .toContain('CONSULTANDO LOGROS EN LA BASE DE DATOS');
    expect(document.getElementById('achievement-static-snapshot')).toBeNull();

    dom.window.close();
  });
});

describe('dashboard inline JavaScript', () => {
  async function loadDashboard(view = '') {
    const url = view
      ? `https://dead-quarantine.test/telemetria.html?view=${view}`
      : 'https://dead-quarantine.test/telemetria.html';
    const dom = await createPage('telemetria.html', url);
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
        statistics: {
          puntajes_totales: 14,
          mejor_puntaje: 71950
        },
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

  it('clears the search and reloads the grid when the trash icon is clicked', async () => {
    const dom = await createPage('ranking.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue(rankingResponse());
    executeInlineScript(dom, (script) => script.includes("url.searchParams.set('view', 'table')"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const search = window.document.getElementById('filter-search');
    search.value = 'FRAN';
    search.dispatchEvent(new window.Event('input'));
    window.document.getElementById('clear-search').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(search.value).toBe('');
    expect(window.fetch).toHaveBeenCalledTimes(2);
    const refreshedUrl = new URL(window.fetch.mock.calls.at(-1)[0]);
    expect(refreshedUrl.searchParams.has('search')).toBe(false);
    expect(window.document.querySelector('#ranking-table-body').textContent).toContain('Luna');

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
  const achievementData = {
    total_usuarios: 10,
    logros: [
      {
        id: 1,
        clave: 'derrotador_supremo',
        titulo: 'Bajas iniciales',
        descripcion: 'Descripción desde la base',
        categoria: 'Bajas',
        modo: 'Singleplayer',
        sublogros_requeridos: 1,
        completados_global: 5,
        porcentaje_global: 50,
        sublogros: [{
          id: 11,
          logro_id: 1,
          clave: 'sub_bajas_1',
          titulo: 'Primera baja',
          orden: 1,
          completados_global: 2,
          porcentaje_global: 20
        }]
      },
      {
        id: 2,
        clave: 'completador_rondas',
        titulo: 'Historia inicial',
        descripcion: 'Otro logro de prueba',
        categoria: 'Historia',
        modo: 'Singleplayer',
        sublogros_requeridos: 1,
        completados_global: 3,
        porcentaje_global: 30,
        sublogros: []
      }
    ]
  };

  async function loadAchievementMatrix(data = achievementData) {
    const dom = await createPage('logros_globales.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data
    });
    window.console.error = vi.fn();
    executeInlineScript(dom, (script) => script.includes('async function loadAchievements'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return dom;
  }

  it('renders achievement names, counts, and percentages from the database response', async () => {
    const dom = await loadAchievementMatrix();
    const { window } = dom;
    const cards = [...window.document.querySelectorAll('.achievement-card')];
    expect(cards).toHaveLength(2);
    expect(window.fetch).toHaveBeenCalledWith('/api/logros/globales', { cache: 'no-store' });
    expect(window.document.getElementById('achievement-total').textContent).toBe('2');
    expect(window.document.getElementById('subachievement-total').textContent).toBe('1');
    expect(window.document.getElementById('registered-users').textContent).toBe('10');
    expect(window.document.getElementById('unlock-average').textContent).toBe('40,0%');
    expect(cards[0].textContent).toContain('Bajas iniciales');
    expect(cards[0].textContent).toContain('Primera baja');
    expect(cards[0].textContent).toContain('50,0%');
    expect(cards[0].querySelector('.material-symbols-outlined')?.textContent).toBe('skull');
    expect(cards[0].textContent).toContain('S-1');
    expect(cards[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(cards[0].querySelector('[role="progressbar"] > div')?.getAttribute('style'))
      .toContain('width: 50%');
    expect(cards[0].querySelector('[role="progressbar"] > div')?.className)
      .toContain('bg-primary-container');
    expect(cards[0].textContent).toContain('REQUERIDOS:');
    expect(cards[1].querySelector('.material-symbols-outlined')?.textContent).toBe('timer');
    expect(cards[1].textContent).toContain('S-3');
    expect(window.document.getElementById('achievement-static-snapshot')).toBeNull();

    dom.window.close();
  });

  it('uses bronze, silver, and gold colors for the first three database sub-achievements', async () => {
    const data = {
      ...achievementData,
      logros: [{
        ...achievementData.logros[0],
        sublogros: [
          { id: 11, titulo: 'Primero', orden: 1, porcentaje_global: 80, completados_global: 8 },
          { id: 12, titulo: 'Segundo', orden: 2, porcentaje_global: 50, completados_global: 5 },
          { id: 13, titulo: 'Tercero', orden: 3, porcentaje_global: 20, completados_global: 2 }
        ]
      }]
    };
    const dom = await loadAchievementMatrix(data);
    const badges = [...dom.window.document.querySelectorAll('.sub-matrix > div > div:last-child > span:first-child')];

    expect(badges.map((badge) => badge.textContent)).toEqual(['BRONCE', 'PLATA', 'ORO']);
    expect(badges[0].className).toContain('bg-orange-700/40');
    expect(badges[1].className).toContain('bg-slate-400/20');
    expect(badges[2].className).toContain('bg-amber-500/20');

    dom.window.close();
  });

  it('restores the original icon and sector badge for each known achievement key', async () => {
    const identities = [
      ['derrotador_supremo', 'Bajas', 'skull', 'S-1', 'text-primary-container', 'bg-primary'],
      ['superviviente_infierno', 'Historia', 'shield_with_heart', 'S-2', 'text-secondary-fixed-dim', 'bg-secondary-container'],
      ['completador_rondas', 'Historia', 'timer', 'S-3', 'text-primary', 'bg-primary'],
      ['campeon_poligono', 'Minijuego', 'adjust', 'S-4', 'text-tertiary', 'bg-tertiary-container'],
      ['donde_esta_wally', 'Easter Egg', 'travel_explore', 'S-5', 'text-secondary-fixed-dim', 'bg-secondary-container']
    ];
    const data = {
      ...achievementData,
      logros: identities.map(([clave, categoria], index) => ({
        ...achievementData.logros[0],
        id: index + 1,
        clave: index === 0 ? ` ${clave.toUpperCase()} ` : clave,
        categoria,
        sublogros: []
      }))
    };
    const dom = await loadAchievementMatrix(data);
    const cards = [...dom.window.document.querySelectorAll('.achievement-card')];

    expect(cards.map((card) => {
      const icon = card.querySelector('.material-symbols-outlined');
      const tile = icon.parentElement;
      const badge = tile.querySelector('.absolute.bottom-0.right-0');
      return [
        icon.textContent,
        card.textContent.match(/S-[1-5]/)?.[0],
        icon.classList.contains('text-[36px]'),
        icon.className.match(/text-[\w-]+/)?.[0],
        tile.classList.contains('w-[60px]') && tile.classList.contains('h-[60px]'),
        badge.className.match(/bg-[\w-]+/)?.[0]
      ];
    })).toEqual(identities.map(([, , icon, badge, color, badgeColor]) => [
      icon,
      badge,
      true,
      color,
      true,
      badgeColor
    ]));

    dom.window.close();
  });

  it('uses the cognition 2 icon for the headache achievement', async () => {
    const dom = await loadAchievementMatrix({
      ...achievementData,
      logros: [{
        ...achievementData.logros[0],
        clave: 'headache_achievement',
        titulo: 'Me duele la cabeza'
      }]
    });
    const card = dom.window.document.querySelector('.achievement-card');

    expect(card.querySelector('.material-symbols-outlined')?.textContent).toBe('cognition_2');
    expect(card.querySelector('.material-symbols-outlined')?.classList.contains('text-primary')).toBe(true);

    dom.window.close();
  });

  it.each([
    ['historiador', 'Logro de prueba'],
    ['achievement_key', 'Historiador']
  ])('uses the book ribbon icon for Historiador (%s key)', async (clave, titulo) => {
    const dom = await loadAchievementMatrix({
      ...achievementData,
      logros: [{
        ...achievementData.logros[0],
        clave,
        titulo
      }]
    });
    const icon = dom.window.document.querySelector('.achievement-card .material-symbols-outlined');

    expect(icon?.textContent).toBe('book_ribbon');

    dom.window.close();
  });

  it('toggles every database achievement card independently', async () => {
    const dom = await loadAchievementMatrix();
    const { window } = dom;
    const cards = [...window.document.querySelectorAll('.achievement-card')];

    for (const card of cards) {
      const toggle = card.querySelector('.toggle-panel');
      const panel = card.querySelector('.sub-matrix');
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.classList.contains('hidden')).toBe(true);
      toggle.click();
      expect(panel.classList.contains('hidden')).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    }

    expect(cards.every((card) =>
      !card.querySelector('.sub-matrix').classList.contains('hidden')
    )).toBe(true);

    dom.window.close();
  });

  it('filters database achievements by category', async () => {
    const dom = await loadAchievementMatrix();
    const { window } = dom;
    const cards = [...window.document.querySelectorAll('.achievement-card')];
    const categories = [...new Set(cards.map((card) => card.getAttribute('data-category')))];
    expect(categories.length).toBeGreaterThan(1);

    for (const category of categories) {
      const categoryPill = [...window.document.querySelectorAll('.cat-pill')]
        .find((pill) => pill.getAttribute('data-cat') === category);
      categoryPill.click();
      const visibleCards = cards.filter((card) => !card.classList.contains('hidden'));
      expect(visibleCards.length).toBeGreaterThan(0);
      expect(visibleCards.every((card) => card.getAttribute('data-category') === category)).toBe(true);
    }

    window.document.querySelector('[data-cat="all"]').click();
    expect(cards.every((card) => !card.classList.contains('hidden'))).toBe(true);

    dom.window.close();
  });

  it('shows a visible error instead of displaying sample data when the API fails', async () => {
    const dom = await createPage('logros_globales.html');
    const { window } = dom;
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error al obtener logros' })
    });
    window.console.error = vi.fn();
    executeInlineScript(dom, (script) => script.includes('async function loadAchievements'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.document.querySelector('#achievements-container').textContent)
      .toContain('No se pudieron consultar los logros en la base de datos');
    expect(window.document.querySelectorAll('.achievement-card')).toHaveLength(0);
    expect(window.document.getElementById('database-connection-status').textContent)
      .toBe('ERROR DE CONEXIÓN');

    dom.window.close();
  });
});
