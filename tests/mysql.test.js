import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createPool } = vi.hoisted(() => ({ createPool: vi.fn() }));

vi.mock('mysql2/promise', () => ({
  default: { createPool }
}));

const requiredEnvironment = {
  MYSQL_HOST: 'db.example.test',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'tester',
  MYSQL_PASSWORD: 'test-password',
  MYSQL_DATABASE: 'dead_quarantine_test'
};

beforeEach(() => {
  vi.resetModules();
  createPool.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadMysqlModule() {
  return import('../lib/mysql.js');
}

describe('getPool', () => {
  it('requires all database environment variables before creating the pool', async () => {
    vi.stubEnv('MYSQL_HOST', '');
    const { getPool } = await loadMysqlModule();

    expect(() => getPool()).toThrow(/MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE/);
    expect(createPool).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '65536', 'not-a-port'])('rejects invalid MySQL port %s', async (port) => {
    Object.entries({ ...requiredEnvironment, MYSQL_PORT: port })
      .forEach(([key, value]) => vi.stubEnv(key, value));
    const { getPool } = await loadMysqlModule();

    expect(() => getPool()).toThrow('MYSQL_PORT debe ser un puerto válido.');
    expect(createPool).not.toHaveBeenCalled();
  });

  it('creates a configured connection pool once and reuses it', async () => {
    Object.entries(requiredEnvironment).forEach(([key, value]) => vi.stubEnv(key, value));
    const pool = { query: vi.fn() };
    createPool.mockReturnValue(pool);
    const { getPool } = await loadMysqlModule();

    expect(getPool()).toBe(pool);
    expect(getPool()).toBe(pool);
    expect(createPool).toHaveBeenCalledOnce();
    expect(createPool).toHaveBeenCalledWith({
      host: 'db.example.test',
      port: 3306,
      user: 'tester',
      password: 'test-password',
      database: 'dead_quarantine_test',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: { rejectUnauthorized: false }
    });
  });

  it('uses the configured CA certificate to verify the database TLS connection', async () => {
    Object.entries(requiredEnvironment).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubEnv('MYSQL_SSL_CA', 'test-ca-certificate');
    createPool.mockReturnValue({ query: vi.fn() });
    const { getPool } = await loadMysqlModule();

    getPool();

    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
      ssl: { ca: 'test-ca-certificate' }
    }));
  });
});
