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
    const achievement = { id: 4, titulo: 'Superviviente', porcentaje_global: 50 };
    const subAchievements = [
      { id: 10, logro_id: '4', titulo: 'Primero' },
      { id: 11, logro_id: 8, titulo: 'Otro logro' }
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
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM logros l'), [2]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('FROM sublogros s'), [2]);
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
    expect(await response.json()).toEqual({ error: 'Error al obtener logros' });
  });
});

describe('POST /api/logros/desbloquear', () => {
  it('rejects malformed JSON and missing required fields', async () => {
    const malformed = await POST(new Request('http://localhost/api/logros/desbloquear', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    }));
    const missingFields = await POST(jsonRequest({ username: 'Player' }));
    const wrongTypes = await POST(jsonRequest({ username: 123, sublogro_clave: true }));
    const missingUserId = await POST(jsonRequest({
      sublogro_clave: 'key'
    }));
    const invalidUserId = await POST(jsonRequest({
      id_usuario: 'not-an-id',
      sublogro_clave: 'key'
    }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: 'El cuerpo de la solicitud no es JSON válido'
    });
    expect(missingFields.status).toBe(400);
    expect(wrongTypes.status).toBe(400);
    expect(missingUserId.status).toBe(400);
    expect(invalidUserId.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown users and sub-achievements', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const response = await POST(jsonRequest({
      id_usuario: 5,
      sublogro_clave: ' unknown '
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Usuario no encontrado' });
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT id_usuario FROM usuario WHERE id_usuario = ? LIMIT 1',
      [5]
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('records progress without unlocking when the requirement is not met', async () => {
    query
      .mockResolvedValueOnce([[{ id_usuario: 2 }]])
      .mockResolvedValueOnce([[{ id: 9, logro_id: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ total_completados: 1 }]])
      .mockResolvedValueOnce([[{ titulo: 'Dominador', sublogros_requeridos: 3 }]]);

    const response = await POST(jsonRequest({
      id_usuario: 2,
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      mensaje: 'Sublogro registrado con éxito',
      logro_padre_desbloqueado: null
    });
    expect(query).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT usuario_id FROM usuario_sublogro WHERE usuario_id = ? AND sublogro_id = ? LIMIT 1',
      [2, 9]
    );
    expect(query).toHaveBeenNthCalledWith(5, expect.stringContaining('COUNT(*) AS total_completados'), [2, 4]);
  });

  it('unlocks the parent achievement after reaching its required count', async () => {
    query
      .mockResolvedValueOnce([[{ id_usuario: 2 }]])
      .mockResolvedValueOnce([[{ id: 9, logro_id: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ total_completados: 3 }]])
      .mockResolvedValueOnce([[{ titulo: 'Dominador', sublogros_requeridos: 3 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);

    const response = await POST(jsonRequest({
      id_usuario: 2,
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(await response.json()).toMatchObject({
      success: true,
      logro_padre_desbloqueado: 'Dominador'
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT IGNORE INTO usuario_logro'),
      [2, 4]
    );
  });

  it('does not reinsert existing user or achievement records', async () => {
    query
      .mockResolvedValueOnce([[{ id_usuario: 2 }]])
      .mockResolvedValueOnce([[{ id: 9, logro_id: 4 }]])
      .mockResolvedValueOnce([[{ id: 12 }]])
      .mockResolvedValueOnce([[{ total_completados: 3 }]])
      .mockResolvedValueOnce([[{ titulo: 'Dominador', sublogros_requeridos: 3 }]])
      .mockResolvedValueOnce([[{ id: 20 }]]);

    const response = await POST(jsonRequest({
      id_usuario: 2,
      sublogro_clave: 'enemigo_derrotado'
    }));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT usuario_id FROM usuario_sublogro WHERE usuario_id = ? AND sublogro_id = ? LIMIT 1',
      [2, 9]
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      'SELECT usuario_id FROM usuario_logro WHERE usuario_id = ? AND logro_id = ? LIMIT 1',
      [2, 4]
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      expect.anything()
    );
  });

  it('returns 404 when the user cannot be found', async () => {
    query.mockResolvedValueOnce([[]]);

    const response = await POST(jsonRequest({
      id_usuario: 5,
      sublogro_clave: 'any'
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Usuario no encontrado' });
  });

  it('returns a server error when the parent achievement is missing', async () => {
    query
      .mockResolvedValueOnce([[{ id_usuario: 2 }]])
      .mockResolvedValueOnce([[{ id: 9, logro_id: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ total_completados: 3 }]])
      .mockResolvedValueOnce([[]]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 2,
      sublogro_clave: 'any'
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Error interno en base de datos' });
  });

  it('returns a server error if persistence fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(jsonRequest({
      id_usuario: 2,
      sublogro_clave: 'any'
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Error interno en base de datos' });
  });
});
