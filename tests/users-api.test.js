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
    const users = [{
      user_id: 1,
      username: 'Player',
      email: null,
      created_at: '2026-10-20T00:00:00.000Z',
      updated_at: '2026-10-20T00:00:00.000Z'
    }];
    query.mockResolvedValueOnce([users]);

    const response = await GET(new Request('http://localhost/api/usuarios'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(users);
    expect(query).toHaveBeenCalledWith(
      'SELECT id_usuario AS user_id, username, email, created_at, updated_at FROM usuario ORDER BY created_at DESC LIMIT 50'
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
    const missingFields = await POST(jsonRequest({ username: 'Player' }));
    const invalidId = await POST(jsonRequest({ id_usuario: '', username: 'Player' }));
    const booleanId = await POST(jsonRequest({ id_usuario: true, username: 'Player' }));

    expect(malformed.status).toBe(400);
    expect(invalidObject.status).toBe(400);
    expect(missingFields.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(booleanId.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a username already used by another user', async () => {
    query.mockResolvedValueOnce([[{ id_usuario: 2 }]]);

    const response = await POST(jsonRequest({
      id_usuario: 1,
      username: '  PLAYER  '
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Ese nombre ya está en uso. Elegí otro.'
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(query).toHaveBeenCalledWith(
      'SELECT id_usuario FROM usuario WHERE LOWER(TRIM(username)) = LOWER(?) AND id_usuario <> ? LIMIT 1',
      ['PLAYER', '1']
    );
    expect(query).toHaveBeenCalledOnce();
  });

  it('upserts an existing user by id_usuario', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({
      id_usuario: 8,
      username: 'Player'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Usuario sincronizado exitosamente',
      user_id: '8',
      username: 'Player'
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO usuario (id_usuario, username, created_at, updated_at)'),
      ['8', 'Player']
    );
    expect(query.mock.calls[1][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('creates a user when the supplied id_usuario does not exist', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({ id_usuario: 8, username: 'Player' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      user_id: '8',
      username: 'Player'
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns a server error and logs database failures', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 1,
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
