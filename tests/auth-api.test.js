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

  it('verifies the Google token and registers a new user with the current schema', async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => tokenPayload });
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({ id_token: 'valid-google-token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      usuario: {
        id: 0,
        google_id: tokenPayload.sub,
        email: tokenPayload.email,
        nombre: tokenPayload.name,
        nivel: 1,
        record: 0
      }
    });
    expect(body.usuario.id_local).toMatch(/^usr_google-user-123_/);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-google-token',
      audience: 'google-client-id'
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id_usuario, username, email, google_id, nivel, record FROM usuario'),
      [tokenPayload.sub, tokenPayload.email]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO usuario (id_usuario, google_id, username, email, nivel, record'),
      expect.arrayContaining([tokenPayload.sub, tokenPayload.name, tokenPayload.email])
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('updates an existing Google user without inserting another row', async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => tokenPayload });
    const user = {
      id_usuario: 7,
      username: 'Chosen Player',
      email: tokenPayload.email,
      google_id: tokenPayload.sub,
      nivel: 4,
      record: 800
    };
    query
      .mockResolvedValueOnce([[user]])
      .mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({ id_token: 'valid-google-token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      usuario: {
        id: 0,
        id_local: user.id_usuario,
        google_id: tokenPayload.sub,
        email: tokenPayload.email,
        nombre: user.username,
        nivel: 4,
        record: 800
      }
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET google_id = ?'),
      [tokenPayload.sub, tokenPayload.email, user.id_usuario]
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usuario'),
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
    expect(await response.json()).toMatchObject({
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
