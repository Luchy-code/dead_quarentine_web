import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../lib/mysql', () => ({
  getPool: () => ({ query })
}));

import { GET } from '../app/api/logros/globales/route.js';
import { POST } from '../app/api/logros/desbloquear/route.js';
import { jsonRequest } from './helpers.js';

beforeEach(() => {
  query.mockReset();
  vi.restoreAllMocks();
});

describe('GET /api/logros/globales', () => {
  it('returns each achievement with its matching sub-achievements', async () => {
    const achievement = { id_logro: 4, nombre: 'Superviviente', porcentaje_global: 50 };
    const subAchievements = [
      { id_sublogro: 10, id_logro: '4', nombre: 'Primero' },
      { id_sublogro: 11, id_logro: 8, nombre: 'Otro logro' }
    ];
    query
      .mockResolvedValueOnce([[{ total_usuarios: 2 }]])
      .mockResolvedValueOnce([[achievement]])
      .mockResolvedValueOnce([subAchievements]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      total_usuarios: 2,
      logros: [{ ...achievement, sublogros: [subAchievements[0]] }]
    });
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM logro l'), [2, 2]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('FROM sublogro s'), [2, 2]);
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN usuario_logro ul');
    expect(query.mock.calls[2][0]).toContain('LEFT JOIN usuario_sublogro us');
  });

  it('returns an empty achievement collection when the database has none', async () => {
    query
      .mockResolvedValueOnce([[{ total_usuarios: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const response = await GET();

    expect(await response.json()).toEqual({ total_usuarios: 0, logros: [] });
  });

  it('returns a server error when a database query fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: 'Error al obtener logros' });
  });
});

describe('POST /api/logros/desbloquear', () => {
  it('rejects malformed JSON and missing or invalid fields', async () => {
    const malformed = await POST(new Request('http://localhost/api/logros/desbloquear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));
    const missingFields = await POST(jsonRequest({ username: 'Player' }));
    const wrongTypes = await POST(jsonRequest({ id_usuario: true, sublogro_clave: 'key' }));
    const missingUserId = await POST(jsonRequest({ sublogro_clave: 'key' }));
    const missingSubAchievement = await POST(jsonRequest({ id_usuario: 'player-1' }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      success: false,
      error: 'El cuerpo de la solicitud no es JSON válido'
    });
    expect(missingFields.status).toBe(400);
    expect(wrongTypes.status).toBe(400);
    expect(missingUserId.status).toBe(400);
    expect(missingSubAchievement.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('upserts the user and returns 404 for an unknown sub-achievement', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([[]]);

    const response = await POST(jsonRequest({
      id_usuario: 'player-5',
      sublogro_clave: ' unknown '
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO usuario (id_usuario, username'),
      ['player-5', 'Superviviente']
    );
    expect(query.mock.calls[0][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM sublogro WHERE sublogro_clave = ?'),
      ['unknown']
    );
  });

  it('records a sub-achievement without unlocking its parent for a non-final rank', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[
        { id_sublogro: 9, id_logro: 4, rango: 'Bronce', objetivo_cantidad: 1 }
      ]])
      .mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({
      id_usuario: 'player-2',
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      mensaje: 'Sublogro registrado con éxito',
      logro_padre_desbloqueado: null
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO usuario_sublogro'),
      ['player-2', 9, 1]
    );
  });

  it('unlocks the parent achievement after completing the final rank', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[
        { id_sublogro: 9, id_logro: 4, rango: 'Oro', objetivo_cantidad: 3 }
      ]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id_logro: 4, nombre: 'Dominador' }]])
      .mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({
      id_usuario: 'player-2',
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      logro_padre_desbloqueado: 'Dominador'
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT IGNORE INTO usuario_logro'),
      ['player-2', 4]
    );
  });

  it('returns a server error when the parent achievement is missing', async () => {
    query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[
        { id_sublogro: 9, id_logro: 4, rango: 'Oro', objetivo_cantidad: 3 }
      ]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[]]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 'player-2',
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Error interno en base de datos'
    });
  });

  it('returns a server error if persistence fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 'player-2',
      sublogro_clave: 'any'
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Error interno en base de datos'
    });
  });
});
