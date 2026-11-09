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
  it('returns ranking rows with CORS and no-cache headers', async () => {
    const rows = [{ id: 1, username: 'Luna', puntos: 12000 }];
    query.mockResolvedValueOnce([rows]);

    const response = await GET(new Request('http://localhost/api/ranking'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WITH ranking_general'), ['']);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("COALESCE(u.username, 'Superviviente') AS username");
    expect(sql).toContain('LEFT JOIN usuario u ON r.id_usuario = u.id_usuario');
    expect(sql).toContain('r.id_usuario AS user_id');
    expect(sql).not.toMatch(/r\.(username|ip|pais|codigo_pais|usa_vpn)\b/);
  });

  it('applies normalized mode, difficulty, and search filters using parameters', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request(
      'http://localhost/api/ranking?mode=Multiplayer&dificultad=Pesadilla&search=Ana'
    ));

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LOWER(r.modo) = ? AND LOWER(r.dificultad) = ?');
    expect(sql).toContain('(u.username LIKE ? OR r.id_usuario LIKE ?)');
    expect(sql.indexOf('ROW_NUMBER()')).toBeLessThan(sql.indexOf('filtered_ranking AS'));
    expect(params).toEqual(['multiplayer', 'pesadilla', '%Ana%', '%Ana%', '']);
  });

  it('uses the requested user id in the regular view', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request('http://localhost/api/ranking?id_usuario=7'));

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), ['7']);
  });

  it('returns paginated table rows, podium, facets, and statistics', async () => {
    const rows = [{ id: 12, username: 'Luna', puntos: 12000, dificultad: 'Pesadilla' }];
    const top = [{ username: 'Luna', puntos: 12000, dificultad: 'Pesadilla' }];
    const facets = [
      { modo: 'singleplayer', dificultad: 'pesadilla' },
      { modo: 'multiplayer', dificultad: 'normal' }
    ];
    query
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ total: 51 }]])
      .mockResolvedValueOnce([top])
      .mockResolvedValueOnce([facets])
      .mockResolvedValueOnce([[{ puntajes_totales: 14, mejor_puntaje: 71950 }]]);

    const response = await GET(new Request(
      'http://localhost/api/ranking?view=table&page=3&limit=25&mode=Singleplayer&dificultad=Pesadilla&search=Luna'
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rows,
      top,
      total: 51,
      statistics: { puntajes_totales: 14, mejor_puntaje: 71950 },
      page: 3,
      limit: 25,
      modos: ['singleplayer', 'multiplayer'],
      dificultades: ['pesadilla', 'normal']
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('LIMIT ? OFFSET ?'),
      ['singleplayer', 'pesadilla', '%Luna%', '%Luna%', 25, 50]
    );
    expect(query.mock.calls[0][0].indexOf('ROW_NUMBER()'))
      .toBeLessThan(query.mock.calls[0][0].indexOf('filtered_ranking AS'));
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('COUNT(*) AS total'), [
      'singleplayer', 'pesadilla', '%Luna%', '%Luna%'
    ]);
  });

  it('caps table page size and falls back to safe defaults', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ puntajes_totales: 0, mejor_puntaje: 0 }]]);

    const response = await GET(new Request(
      'http://localhost/api/ranking?view=table&page=-1&limit=1000'
    ));
    const body = await response.json();

    expect(body.page).toBe(1);
    expect(body.limit).toBe(100);
    expect(query.mock.calls[0][1]).toEqual([100, 0]);
  });

  it('returns a preliminary position for a score', async () => {
    query.mockResolvedValueOnce([[{ puesto: 4 }]]);

    const response = await GET(new Request('http://localhost/api/ranking?score=1200'));

    expect(await response.json()).toEqual({ puesto: 4 });
    expect(query).toHaveBeenCalledWith(
      'SELECT COUNT(*) + 1 AS puesto FROM ranking WHERE puntos > ?',
      [1200]
    );
  });

  it('returns a server error if the database query fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(new Request('http://localhost/api/ranking'));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Error al obtener ranking' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe('POST /api/ranking', () => {
  it('rejects malformed, null, and array request bodies', async () => {
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
    [{ id_usuario: 1 }, 'missing points'],
    [{ id_usuario: 1, puntos: null }, 'null points'],
    [{ id_usuario: 1, puntos: '' }, 'empty points'],
    [{ id_usuario: 1, puntos: -1 }, 'negative points'],
    [{ id_usuario: 1, puntos: 'not a number' }, 'non-numeric points'],
    [{ id_usuario: 1, puntos: Infinity }, 'infinite points'],
    [{ id_usuario: true, puntos: 10 }, 'boolean user id'],
    [{ puntos: 10 }, 'missing user id']
  ])('rejects invalid score input (%s)', async (body) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('upserts the user and stores ranking data using the current schema', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ insertId: 42 }]);

    const response = await POST(jsonRequest({
      id_usuario: ' player-1 ',
      username: '  Player  ',
      puntos: '0',
      modo: '  Multiplayer ',
      dificultad: '  Pesadilla '
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: 'Puntuación guardada exitosamente',
      id: 42
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO usuario (id_usuario, username, created_at, updated_at)'),
      ['player-1', 'Player']
    );
    expect(query.mock.calls[0][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('(id_usuario, puntos, modo, dificultad, creado_en)'),
      ['player-1', 0, 'Multiplayer', 'Pesadilla']
    );
    expect(query.mock.calls[1][0]).not.toMatch(/username|ip|pais|usa_vpn/);
  });

  it('defaults missing mode and difficulty and supports the user_id alias', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ insertId: 7 }]);

    await POST(jsonRequest({
      user_id: 1,
      puntos: 25
    }));

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO ranking'),
      ['1', 25, 'Singleplayer', 'Normal']
    );
  });

  it('rejects empty point strings before touching the database', async () => {
    const response = await POST(jsonRequest({ id_usuario: 1, puntos: '  ' }));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a server error if saving a score fails', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 1,
      username: 'Player',
      puntos: 1
    }));

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
