import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../lib/mysql', () => ({
  getPool: () => ({ query })
}));

import { GET, OPTIONS, POST } from '../app/api/usuarios/route.js';
import { jsonRequest } from './helpers.js';

beforeEach(() => {
  query.mockReset();
  vi.restoreAllMocks();
});

describe('GET /api/usuarios', () => {
  it('returns users with the current database columns', async () => {
    const users = [{ id: 1, id_local: 'local-1', nombre: 'Player', creado_en: '2026-10-20T00:00:00.000Z' }];
    query.mockResolvedValueOnce([users]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(users);
    expect(query).toHaveBeenCalledWith(
      'SELECT id, id_local, nombre, creado_en FROM usuarios ORDER BY creado_en DESC'
    );
  });
});

describe('POST /api/usuarios', () => {
  it('rejects malformed or invalid request bodies', async () => {
    const malformed = await POST(new Request('http://localhost/api/usuarios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));
    const invalidObject = await POST(jsonRequest(null));
    const missingFields = await POST(jsonRequest({ user_id: 'id' }));
    const tooLongId = await POST(jsonRequest({
      user_id: 'x'.repeat(256),
      username: 'Player'
    }));

    expect(malformed.status).toBe(400);
    expect(invalidObject.status).toBe(400);
    expect(missingFields.status).toBe(400);
    expect(tooLongId.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('upserts a user without writing the name to ranking rows', async () => {
    query.mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({
      user_id: ' external-123 ',
      username: `  ${'A'.repeat(55)}  `
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Usuario sincronizado exitosamente',
      user_id: 'external-123',
      username: 'A'.repeat(50)
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO usuarios (id_local, nombre'),
      ['external-123', 'A'.repeat(50)]
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns a server error and logs database failures', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      user_id: 'external-123',
      username: 'Player'
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Error en base de datos' });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe('OPTIONS /api/usuarios', () => {
  it('advertises POST and OPTIONS', () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });
});
