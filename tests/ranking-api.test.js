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
    expect(query.mock.calls[0][0]).toContain('COALESCE(u.nombre, r.user_id) AS username');
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN usuarios u ON r.user_id = u.id_local');
    expect(query.mock.calls[0][0]).toContain('r.user_id');
    expect(query.mock.calls[0][0]).toContain('r.dificultad');
    expect(query.mock.calls[0][0]).not.toMatch(/r\.(username|ip|pais|codigo_pais|usa_vpn)\b/);
  });

  it('applies mode, difficulty, and search using parameters', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request(
      'http://localhost/api/ranking?mode=Multiplayer&dificultad=Pesadilla&search=Ana'
    ));

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('AND r.modo = ?');
    expect(sql).toContain('AND r.dificultad = ?');
    expect(sql).toContain('COALESCE(u.nombre, r.user_id) LIKE ? OR r.user_id LIKE ?');
    expect(params).toEqual(['multiplayer', 'pesadilla', '%Ana%', '%Ana%', '']);
  });

  it('ignores legacy metadata filters and limits the regular ranking to five rows', async () => {
    query.mockResolvedValueOnce([[]]);

    await GET(new Request(
      'http://localhost/api/ranking?country=ALL&mode=ALL&vpnOnly=false&limit=1000'
    ));

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain('r.codigo_pais');
    expect(sql).not.toContain('r.modo = ?');
    expect(sql).not.toContain('r.usa_vpn');
    expect(sql).toContain('LIMIT 5');
    expect(params).toEqual(['']);
  });

  it('returns paginated database rows, top three, and filter options in table view', async () => {
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
      .mockResolvedValueOnce([facets]);

    const response = await GET(new Request(
      'http://localhost/api/ranking?view=table&page=3&limit=25&mode=Singleplayer&dificultad=Pesadilla&search=Luna'
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rows,
      top,
      total: 51,
      page: 3,
      limit: 25,
      modos: ['singleplayer', 'multiplayer'],
      dificultades: ['pesadilla', 'normal']
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('r.puntos DESC, r.creado_en ASC, r.id ASC'),
      ['singleplayer', 'pesadilla', '%Luna%', '%Luna%', 25, 50]
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('COUNT(*) AS total'), [
      'singleplayer', 'pesadilla', '%Luna%', '%Luna%'
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
    [{ user_id: 'local-1', puntos: 10 }, 'missing username'],
    [{ user_id: 'local-1', username: ' ', puntos: 10 }, 'blank username'],
    [{ user_id: 'local-1', username: 'user' }, 'missing points'],
    [{ user_id: 'local-1', username: 'user', puntos: null }, 'null points'],
    [{ user_id: 'local-1', username: 'user', puntos: '' }, 'empty points'],
    [{ user_id: 'local-1', username: 'user', puntos: -1 }, 'negative points'],
    [{ user_id: 'local-1', username: 'user', puntos: 'not a number' }, 'non-numeric points'],
    [{ user_id: 'local-1', username: 'user', puntos: Infinity }, 'infinite points'],
    [{ username: 'user', puntos: 10 }, 'missing user id']
  ])('rejects invalid score input (%s)', async (body) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'user_id, username, modo, dificultad y puntos válidos son obligatorios'
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('stores only normalized ranking data and synchronizes the user name separately', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ insertId: 42 }]);

    const response = await POST(jsonRequest({
      user_id: ' local-1 ',
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
      expect.stringContaining('INSERT INTO usuarios (id_local, nombre'),
      ['local-1', 'Player']
    );
    expect(query.mock.calls[1][0]).toContain(
      '(puntos, modo, dificultad, creado_en, user_id)'
    );
    expect(query.mock.calls[1][0]).not.toMatch(/username|ip|pais|usa_vpn/);
    expect(query.mock.calls[1][1]).toEqual([0, 'multiplayer', 'pesadilla', 'local-1']);
  });

  it('defaults missing mode and difficulty to singleplayer and normal', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ insertId: 7 }]);

    await POST(jsonRequest({
      user_id: 'local-1',
      username: 'Player',
      puntos: 25
    }));

    expect(query.mock.calls[1][1]).toEqual([25, 'singleplayer', 'normal', 'local-1']);
  });

  it('requires and stores the local user id without storing the username in ranking', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ insertId: 5 }]);

    await POST(jsonRequest({
      user_id: ' external-123 ',
      username: 'Player',
      puntos: 10
    }));

    expect(query.mock.calls[0][0]).toContain('INSERT INTO usuarios (id_local, nombre');
    expect(query.mock.calls[1][0]).toContain('(puntos, modo, dificultad, creado_en, user_id)');
    expect(query.mock.calls[1][0]).not.toContain('username');
    expect(query.mock.calls[1][1]).toEqual([10, 'singleplayer', 'normal', 'external-123']);
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

  it('rejects unsupported mode and difficulty values', async () => {
    for (const body of [
      { user_id: 'local-1', username: 'Player', puntos: 1, modo: 'horda' },
      { user_id: 'local-1', username: 'Player', puntos: 1, dificultad: 'facil' }
    ]) {
      const response = await POST(jsonRequest(body));

      expect(response.status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a server error if inserting the score fails', async () => {
    query.mockResolvedValueOnce([{}]).mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      user_id: 'local-1',
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
