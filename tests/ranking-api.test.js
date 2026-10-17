import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../lib/mysql', () => ({
  getPool: () => ({ query })
}));

import { GET, OPTIONS, POST } from '../app/api/ranking/route.js';
import { jsonRequest } from './helpers.js';

beforeEach(() => {
  query.mockReset();
  vi.restoreAllMocks();
});

describe('GET /api/ranking', () => {
  it('marks ranking responses as non-cacheable', async () => {
    query.mockResolvedValueOnce([[]]);

    const response = await GET(new Request('http://localhost/api/ranking'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns ranking rows and CORS headers', async () => {
    const rows = [{ id: 1, username: 'Luna', puntos: 12000 }];
    query.mockResolvedValueOnce([rows]);

    const response = await GET(new Request('http://localhost/api/ranking'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WITH ranking_general'), ['']);
    expect(query.mock.calls[0][0]).toContain('COALESCE(u.username, r.username) AS username');
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN usuarios u ON r.user_id = u.user_id');
    expect(query.mock.calls[0][0]).toContain('r.user_id');
    expect(query.mock.calls[0][0]).toContain('r.dificultad');
  });

  it('applies country, mode, difficulty, VPN, and search using parameters', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request(
      'http://localhost/api/ranking?country=AR&mode=Multiplayer&dificultad=Pesadilla&vpnOnly=true&search=Ana'
    ));

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('AND r.codigo_pais = ?');
    expect(sql).toContain('AND r.modo = ?');
    expect(sql).toContain('AND r.dificultad = ?');
    expect(sql).toContain('AND r.usa_vpn = 0');
    expect(sql).toContain('COALESCE(u.username, r.username) LIKE ? OR r.user_id LIKE ?');
    expect(params).toEqual(['AR', 'Multiplayer', 'Pesadilla', '%Ana%', '%Ana%', '']);
  });

  it('ignores ALL filters and limits the regular ranking to five rows', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request(
      'http://localhost/api/ranking?country=ALL&mode=ALL&vpnOnly=false&limit=1000'
    ));

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain('r.codigo_pais = ?');
    expect(sql).not.toContain('r.modo = ?');
    expect(sql).not.toContain('r.usa_vpn = 0');
    expect(sql).toContain('LIMIT 5');
    expect(params).toEqual(['']);
  });

  it('returns paginated database rows, top three, and filter options in table view', async () => {
    const rows = [{ id: 12, username: 'Luna', puntos: 12000, dificultad: 'Pesadilla' }];
    const top = [{ username: 'Luna', puntos: 12000, dificultad: 'Pesadilla' }];
    const facets = [
      { modo: 'Horda', dificultad: 'Pesadilla', codigo_pais: 'AR', pais: 'Argentina' },
      { modo: 'Rondas', dificultad: 'Normal', codigo_pais: 'AR', pais: 'Argentina' }
    ];
    query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ total: 51 }]])
      .mockResolvedValueOnce([top])
      .mockResolvedValueOnce([facets]);

    const response = await GET(new Request(
      'http://localhost/api/ranking?view=table&page=3&limit=25&country=AR&mode=Horda&dificultad=Pesadilla&vpnOnly=true&search=Luna'
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rows,
      top,
      total: 51,
      page: 3,
      limit: 25,
      modos: ['Horda', 'Rondas'],
      dificultades: ['Pesadilla', 'Normal'],
      paises: [{ codigo_pais: 'AR', pais: 'Argentina' }]
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('r.puntos DESC, r.creado_en ASC, r.id ASC'),
      ['AR', 'Horda', 'Pesadilla', '%Luna%', '%Luna%', 25, 50]
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('COUNT(*) AS total'), [
      'AR', 'Horda', 'Pesadilla', '%Luna%', '%Luna%'
    ]);
    expect(query.mock.calls[0][0]).toContain('r.dificultad');
    expect(query.mock.calls[0][0]).toContain('LIMIT ? OFFSET ?');
  });

  it('returns a server error if the database query fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(new Request('http://localhost/api/ranking'));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Error al obtener ranking' });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe('POST /api/ranking', () => {
  it('rejects malformed JSON and non-object JSON bodies', async () => {
    const malformed = await POST(new Request('http://localhost/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));
    const array = await POST(jsonRequest([]));
    const nullBody = await POST(new Request('http://localhost/api/ranking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null'
    }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'El cuerpo debe ser JSON válido' });
    expect(array.status).toBe(400);
    expect(nullBody.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [{ puntos: 10 }, 'missing username'],
    [{ username: ' ', puntos: 10 }, 'blank username'],
    [{ username: 'user' }, 'missing points'],
    [{ username: 'user', puntos: null }, 'null points'],
    [{ username: 'user', puntos: '' }, 'empty points'],
    [{ username: 'user', puntos: -1 }, 'negative points'],
    [{ username: 'user', puntos: 'not a number' }, 'non-numeric points'],
    [{ username: 'user', puntos: Infinity }, 'infinite points']
  ])('rejects invalid score input (%s)', async (body) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'username y puntos válidos son obligatorios' });
    expect(query).not.toHaveBeenCalled();
  });

  it('stores normalized score data and prefers proxy headers for client metadata', async () => {
    query.mockResolvedValueOnce([{ insertId: 42 }]);

    const response = await POST(jsonRequest({
      username: '  Player  ',
      puntos: '0',
      modo: '  Multiplayer ',
      dificultad: '  Pesadilla ',
      pais: ' ',
      ip: 'body-ip',
      codigo_pais: 'BR',
      usa_vpn: 'true'
    }, {
      'cf-connecting-ip': 'cloudflare-ip',
      'x-real-ip': 'real-ip',
      'x-forwarded-for': 'forwarded-ip, proxy-ip',
      'cf-ipcountry': 'AR',
      'x-vercel-ip-country': 'CL'
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: 'Puntuación guardada exitosamente',
      id: 42
    });
    expect(query.mock.calls[0][1]).toEqual([
      null, 'Player', 0, 'Multiplayer', 'Pesadilla', 'cloudflare-ip', 'AR', 'AR', 1
    ]);
  });

  it('uses fallback metadata and the default mode when no proxy metadata is present', async () => {
    query.mockResolvedValueOnce([{ insertId: 7 }]);

    await POST(jsonRequest({
      username: 'Player',
      puntos: 25,
      ip: 'body-ip',
      usa_vpn: 'unknown'
    }));

    expect(query.mock.calls[0][1]).toEqual([
      null, 'Player', 25, 'Singleplayer', null, 'body-ip', 'Desconocido', null, null
    ]);
  });

  it.each([
    [true, 1],
    [1, 1],
    ['1', 1],
    ['true', 1],
    [false, 0],
    [0, 0],
    ['0', 0],
    ['false', 0],
    ['unknown', null]
  ])('normalizes VPN value %j to %j', async (vpnValue, expected) => {
    query.mockResolvedValueOnce([{ insertId: 1 }]);

    await POST(jsonRequest({ username: 'Player', puntos: 1, usa_vpn: vpnValue }));

    expect(query.mock.calls[0][1][8]).toBe(expected);
  });

  it('stores an optional external user id with the score', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ insertId: 5 }]);

    await POST(jsonRequest({
      user_id: ' external-123 ',
      username: 'Player',
      puntos: 10
    }));

    expect(query.mock.calls[0][0]).toContain('INSERT INTO usuarios (user_id, username');
    expect(query.mock.calls[1][0]).toContain('(user_id, username, puntos');
    expect(query.mock.calls[1][0]).toContain('dificultad');
    expect(query.mock.calls[1][1][0]).toBe('external-123');
  });

  it('rejects invalid external user ids', async () => {
    const response = await POST(jsonRequest({
      user_id: 12,
      username: 'Player',
      puntos: 10
    }));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a server error if inserting the score fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({ username: 'Player', puntos: 1 }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Error al insertar en la base de datos' });
  });
});

describe('OPTIONS /api/ranking', () => {
  it('advertises the supported CORS methods', () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });
});
