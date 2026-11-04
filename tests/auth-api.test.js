import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, verifyIdToken } = vi.hoisted(() => ({
  query: vi.fn(),
  verifyIdToken: vi.fn()
}));

vi.mock('../lib/mysql', () => ({
  getPool: () => ({ query })
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    verifyIdToken(...args) {
      return verifyIdToken(...args);
    }
  }
}));

import { OPTIONS, POST } from '../app/api/auth/route.js';
import { jsonRequest } from './helpers.js';

const tokenPayload = {
  sub: 'google-user-123',
  name: 'Google Player',
  email: 'player@example.test',
  email_verified: true
};

beforeEach(() => {
  query.mockReset();
  verifyIdToken.mockReset();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth', () => {
  it('rejects invalid requests before contacting Google or MySQL', async () => {
    const invalidJson = await POST(new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));
    const missingToken = await POST(jsonRequest({}));

    expect(invalidJson.status).toBe(400);
    expect(missingToken.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('verifies the Google token and inserts a new user with the current schema', async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => tokenPayload });
    const user = {
      id: 7,
      id_local: tokenPayload.sub,
      email: tokenPayload.email,
      nombre: tokenPayload.email,
      creado_en: '2026-11-03T00:00:00.000Z'
    };
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[user]]);

    const response = await POST(jsonRequest({ id_token: 'valid-google-token' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      usuario: {
        ...user,
        google_id: tokenPayload.sub
      }
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-google-token',
      audience: 'google-client-id'
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM usuarios WHERE id_local = ? LIMIT 1',
      [tokenPayload.sub]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO usuarios (id_local, email, nombre, creado_en)'),
      [tokenPayload.sub, tokenPayload.email, tokenPayload.email]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT id, id_local, email, nombre, creado_en FROM usuarios WHERE id_local = ? LIMIT 1',
      [tokenPayload.sub]
    );
  });

  it('updates an existing Google user without inserting another row', async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => tokenPayload });
    const user = {
      id: 7,
      id_local: tokenPayload.sub,
      email: tokenPayload.email,
      nombre: tokenPayload.email,
      creado_en: '2026-11-03T00:00:00.000Z'
    };
    query
      .mockResolvedValueOnce([[{ id: user.id }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[user]]);

    const response = await POST(jsonRequest({ id_token: 'valid-google-token' }));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE usuarios SET email = ?, nombre = ? WHERE id_local = ?',
      [tokenPayload.email, tokenPayload.email, tokenPayload.sub]
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuarios'),
      expect.anything()
    );
  });

  it('rejects Google accounts without a verified email', async () => {
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ ...tokenPayload, email_verified: false })
    });

    const response = await POST(jsonRequest({ id_token: 'unverified-google-token' }));

    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns unauthorized for an unverifiable Google token', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({ id_token: 'invalid-token' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Token inválido o expirado'
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a server error and logs database failures', async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => tokenPayload });
    query.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({ id_token: 'valid-google-token' }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Error en base de datos'
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe('OPTIONS /api/auth', () => {
  it('allows cross-origin POST requests', () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });
});
