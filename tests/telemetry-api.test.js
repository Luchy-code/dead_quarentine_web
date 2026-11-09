import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../lib/mysql', () => ({
  getPool: () => ({ query })
}));

import { GET } from '../app/api/telemetria/route.js';

beforeEach(() => {
  query.mockReset();
  vi.restoreAllMocks();
});

describe('GET /api/telemetria', () => {
  it('counts unique registered users with a record or achievement without caching', async () => {
    query.mockResolvedValueOnce([[
      { usuarios_totales: '20', usuarios_activos: '3' }
    ]]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      usuarios_totales: 20,
      usuarios_activos: 3,
      porcentaje_activos: 15
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('WHERE EXISTS');
    expect(query.mock.calls[0][0]).toContain('FROM ranking r WHERE r.id_usuario = u.id_usuario');
    expect(query.mock.calls[0][0]).toContain('FROM usuario_logro ul WHERE ul.id_usuario = u.id_usuario');
    expect(query.mock.calls[0][0]).toContain('FROM usuario_sublogro us WHERE us.id_usuario = u.id_usuario');
    expect(query.mock.calls[0][0]).not.toContain('ul.usuario_id');
    expect(query.mock.calls[0][0]).not.toContain('us.usuario_id');
  });

  it('returns zero active percentage when there are no registered users', async () => {
    query.mockResolvedValueOnce([[
      { usuarios_totales: '0', usuarios_activos: '0' }
    ]]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      usuarios_totales: 0,
      usuarios_activos: 0,
      porcentaje_activos: 0
    });
  });

  it('rejects impossible counts instead of returning an invalid percentage', async () => {
    query.mockResolvedValueOnce([[
      { usuarios_totales: '2', usuarios_activos: '3' }
    ]]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'No se pudo obtener la telemetría de usuarios'
    });
  });

  it('reports database errors instead of returning success-shaped counts', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'No se pudo obtener la telemetría de usuarios'
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
